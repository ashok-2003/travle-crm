// The console's date changes (spec 7.3): a trial's last day moves only while the trial lasts today, and time given
// makes an organization active again from any state; each decides on the state due today, so whether the nightly job
// has run changes no answer.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advanceSubscriptions,
  cancel,
  getSubscription,
  setPaidThrough,
  setTrialEnd,
} from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

/** 00:30 on 17 October in India, still 16 October in UTC. */
const justAfterMidnightInIndia = new Date("2026-10-16T19:00:00Z");
const now = testNow;

describe("a subscription's dates", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const inPlatform = <T>(fn: Parameters<typeof test.platformDb.transaction<T>>[0]) => test.platformDb.transaction(fn);

  it("moves a trial's end only during the trial, and not into the past", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { trialEndsOn: "2026-10-30", paidThrough: null },
      { now: justAfterMidnightInIndia },
    );
    const at = justAfterMidnightInIndia;
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-10-16" }, at)),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    expect(
      await inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-11-15" }, at)),
    ).toMatchObject({ status: "trial", trialEndsOn: "2026-11-15" });
    const paying = await createSubscribedOrganization(test, plan);
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId: paying, trialEndsOn: "2026-11-15" }, at)),
    ).rejects.toMatchObject({ reason: "NOT_IN_TRIAL" });
  });

  it("decides on the state due today: a trial that ended is over, whether or not the daily job has run", async () => {
    const trial = { trialEndsOn: "2026-10-10", paidThrough: null };
    const started = new Date("2026-10-01T06:00:00Z");
    const ran = await createSubscribedOrganization(test, plan, trial, { now: started });
    const late = await createSubscribedOrganization(test, plan, trial, { now: started });
    await advanceSubscriptions({ db: test.platformDb, organizationIds: [ran], now });
    for (const organizationId of [ran, late]) {
      await expect(
        inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-10-31" }, now)),
      ).rejects.toMatchObject({ reason: "NOT_IN_TRIAL" });
    }
  });

  it("brings a cancelled organization back once it is paid through today, but not for a day already past", async () => {
    const organizationId = await createSubscribedOrganization(test, plan);
    await inPlatform((tx) => cancel(tx, byAdmin, { organizationId, reason: "Left us" }, justAfterMidnightInIndia));
    expect(
      await inPlatform((tx) =>
        setPaidThrough(
          tx,
          byAdmin,
          { organizationId, paidThrough: "2026-10-16", reason: "Correction" },
          justAfterMidnightInIndia,
        ),
      ),
    ).toMatchObject({ status: "cancelled", paidThrough: "2026-10-16" });
    expect(
      await inPlatform((tx) =>
        setPaidThrough(
          tx,
          byAdmin,
          { organizationId, paidThrough: "2026-10-17", reason: "Came back" },
          justAfterMidnightInIndia,
        ),
      ),
    ).toMatchObject({ status: "active", since: "2026-10-17", paidThrough: "2026-10-17" });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.paid-through-changed",
      before: { paidThrough: "2026-10-16", status: "cancelled" },
      after: { paidThrough: "2026-10-17", status: "active", reason: "Came back" },
    });
  });

  it("puts a correction that moves the day back where those dates take the organization today", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    // Paid only through September: past due from 1 October, read-only from the 8th.
    expect(
      await inPlatform((tx) =>
        setPaidThrough(tx, byAdmin, { organizationId, paidThrough: "2026-09-30", reason: "Bounced cheque" }, now),
      ),
    ).toMatchObject({
      status: "read_only",
      since: "2026-10-08",
      recorded: { status: "read_only", since: "2026-10-08" },
    });
    expect(await inPlatform((tx) => getSubscription(tx, organizationId, now))).toMatchObject({
      paidThrough: "2026-09-30",
      nextChangeOn: "2026-10-22",
    });
  });
});
