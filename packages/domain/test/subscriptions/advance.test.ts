// The nightly lifecycle job (spec 7.3), as the platform role: it records each subscription where its unpaid days have
// taken it, by the system, once; it catches up missed days; a payment the console records at the same moment is
// never overwritten, whichever comes first; one organization's failure stops no other, and fails the job.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advanceSubscriptions,
  getSubscription,
  LifecycleJobError,
  recordPayment,
  type SubscriptionWriter,
} from "../../src/subscriptions/index.js";
import { waitUntilBlockedBy } from "../lock-waits.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  holdOpen,
  subscriptionEntries,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const started = new Date("2026-08-01T06:00:00Z");
const now = testNow;

describe("the lifecycle job", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const subscriptionOf = (organizationId: string) =>
    test.platformDb.transaction((tx) => getSubscription(tx, organizationId, now));
  const advance = (organizationIds: string[], at = now) =>
    advanceSubscriptions({ db: test.platformDb, organizationIds, now: at });
  const payThroughDecember = (organizationId: string, tx: OrgTx) =>
    recordPayment(
      tx,
      byAdmin,
      { organizationId, amountPaise: 250_000, paidOn: "2026-10-16", paidThrough: "2026-12-31", reference: "UPI 1" },
      { now },
    );

  it("moves an ended trial to past due, by the system, and finds nothing more to do on a second run", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { trialEndsOn: "2026-10-15", paidThrough: null },
      { now: started },
    );
    expect(await advance([organizationId])).toEqual([
      { organizationId, from: "trial", to: "past_due", since: "2026-10-16" },
    ]);
    expect(await advance([organizationId])).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "past_due",
      recorded: { status: "past_due", since: "2026-10-16" },
    });
    // Midnight on 16 October in India: the day the state began, not the moment the job noticed.
    const stored = await test.platform.subscription.findUniqueOrThrow({ where: { organizationId } });
    expect(stored.statusChangedAt.toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.status-changed",
      source: "job",
      actorUserId: null,
      before: { status: "trial" },
      after: { status: "past_due", since: "2026-10-16" },
    });
  });

  it("catches up when it hasn't run for weeks, counting each state from the day it was due", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    const [change] = await advance([organizationId]);
    expect(change).toEqual({ organizationId, from: "active", to: "suspended", since: "2026-09-22" });
  });

  it("never overwrites a payment the console records while it runs: the organization ends paid and active", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    // The console records a payment through December, and its transaction stays open while the job runs into it.
    const held = holdOpen();
    const paying = test.platformDb.transaction(async (tx) => {
      const payment = await payThroughDecember(organizationId, tx);
      await held.pause(tx);
      return payment;
    });
    const job = advance([organizationId]);
    await waitUntilBlockedBy(test.platform, await held.pid);
    held.release();
    await paying;
    // The job read the subscription only once the payment was in: paid ahead, nothing was due.
    expect(await job).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "active",
      paidThrough: "2026-12-31",
      recorded: { status: "active" },
    });
  });

  it("lets a payment that comes while it writes find its change, and make the organization active", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    // The job's own transaction stays open after it recorded the suspension, while the console's payment waits.
    const held = holdOpen();
    const pausing: SubscriptionWriter = {
      transaction: (fn) =>
        test.platformDb.transaction(async (tx) => {
          const result = await fn(tx);
          await held.pause(tx);
          return result;
        }),
    };
    const job = advanceSubscriptions({ db: pausing, organizationIds: [organizationId], now });
    const pid = await held.pid;
    const paying = test.platformDb.transaction((tx) => payThroughDecember(organizationId, tx));
    await waitUntilBlockedBy(test.platform, pid);
    held.release();
    expect(await job).toEqual([{ organizationId, from: "active", to: "suspended", since: "2026-09-22" }]);
    await paying;
    expect(await subscriptionOf(organizationId)).toMatchObject({ status: "active", paidThrough: "2026-12-31" });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      before: { status: "suspended" },
      after: { status: "active" },
    });
  });

  it("doesn't wait for a payment being inserted elsewhere: its foreign key's KEY SHARE lets the lock through", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { trialEndsOn: "2026-10-15", paidThrough: null },
      { now: started },
    );
    const held = holdOpen();
    const inserting = test.platformDb.transaction(async (tx) => {
      await tx.subscriptionPayment.create({
        data: { organizationId, amountPaise: 100, paidOn: new Date("2026-10-16"), paidThrough: new Date("2026-10-20") },
      });
      await held.pause(tx);
    });
    await held.pid;
    // FOR UPDATE would wait here until the insert commits; FOR NO KEY UPDATE goes ahead.
    expect(await advance([organizationId])).toEqual([
      { organizationId, from: "trial", to: "past_due", since: "2026-10-16" },
    ]);
    held.release();
    await inserting;
  });

  it("reports each organization it can't advance, goes on past it, then fails naming it by id", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-09-30" },
      { now: started },
    );
    const reported: string[] = [];
    const failed = await advanceSubscriptions({
      db: test.platformDb,
      organizationIds: ["not-an-organization", organizationId],
      now: new Date("2026-10-02T06:00:00Z"),
      onError: (_error, failedId) => reported.push(failedId),
    }).catch((error: unknown) => error);
    expect(reported).toEqual(["not-an-organization"]);
    expect(failed).toBeInstanceOf(LifecycleJobError);
    const { failures, changes, message } = failed as LifecycleJobError;
    expect(failures.map((failure) => failure.organizationId)).toEqual(["not-an-organization"]);
    expect(changes).toEqual([{ organizationId, from: "active", to: "past_due", since: "2026-10-01" }]);
    expect(message).toMatch(/^1 of 2 subscriptions not advanced; the first, not-an-organization: /);
    expect((await subscriptionOf(organizationId)).recorded).toEqual({ status: "past_due", since: "2026-10-01" });
  });
});
