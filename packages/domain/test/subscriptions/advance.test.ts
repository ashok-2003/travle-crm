// The daily lifecycle job (spec 7.3): it records each subscription where its unpaid days have taken it, by the
// system, once; it catches up missed days; a console change made meanwhile wins; one organization's failure stops no
// other.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceSubscriptions, getSubscription } from "../../src/subscriptions/index.js";
import {
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const started = new Date("2026-08-01T06:00:00Z");

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
    test.platformDb.transaction((tx) => getSubscription(tx, organizationId));

  it("moves an ended trial to past due, by the system, and finds nothing more to do on a second run", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { trialEndsOn: "2026-10-15", paidThrough: null },
      {
        now: started,
      },
    );
    const now = new Date("2026-10-16T06:00:00Z");
    expect(await advanceSubscriptions({ db: test.db, organizationIds: [organizationId], now })).toEqual([
      { organizationId, from: "trial", to: "past_due", since: "2026-10-16" },
    ]);
    expect(await advanceSubscriptions({ db: test.db, organizationIds: [organizationId], now })).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "past_due",
      // Midnight on 16 October in India: the day the state began.
      statusChangedAt: "2026-10-15T18:30:00.000Z",
    });
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
    const [change] = await advanceSubscriptions({
      db: test.db,
      organizationIds: [organizationId],
      now: new Date("2026-10-16T06:00:00Z"),
    });
    expect(change).toEqual({ organizationId, from: "active", to: "suspended", since: "2026-09-22" });
  });

  it("leaves a subscription the console changed meanwhile as the console left it", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holderPid: (pid: number) => void = () => undefined;
    const holding = new Promise<number>((resolve) => (holderPid = resolve));
    // A payment recorded in the console: it holds the subscription while the job tries to move it.
    const paying = test.platformDb.transaction(async (tx) => {
      const [session] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT 1 FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
      holderPid(session?.pid ?? 0);
      await released;
      await tx.subscription.update({
        where: { organizationId },
        data: { paidThrough: new Date("2026-12-31"), status: "active", statusChangedAt: new Date() },
      });
    });
    const pid = await holding;
    const job = advanceSubscriptions({
      db: test.db,
      organizationIds: [organizationId],
      now: new Date("2026-10-16T06:00:00Z"),
    });
    await waitUntilBlockedBy(pid);
    release();
    await paying;
    expect(await job).toEqual([]);
    expect(await subscriptionOf(organizationId)).toMatchObject({ status: "active", paidThrough: "2026-12-31" });
  });

  /** Waits until some statement waits for a lock the backend `pid` holds: the job has read the old row by then. */
  async function waitUntilBlockedBy(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const [row] = await test.platform.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted AND ${pid}::int = ANY (pg_blocking_pids(pid))`;
      if ((row?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("The job never waited for the console's change");
  }

  it("goes on past an organization it can't advance, reporting it by id", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-09-30" },
      { now: started },
    );
    const failed: string[] = [];
    const changes = await advanceSubscriptions({
      db: test.db,
      organizationIds: ["not-an-organization", organizationId],
      now: new Date("2026-10-02T06:00:00Z"),
      onError: (_error, failedId) => failed.push(failedId),
    });
    expect(failed).toEqual(["not-an-organization"]);
    expect(changes).toEqual([{ organizationId, from: "active", to: "past_due", since: "2026-10-01" }]);
  });
});
