// Ending access by hand (spec 7.3): a suspension made by platform staff holds whatever is paid until it is lifted, and
// lifting it leaves the organization where its lifecycle is today; a cancellation locks it, and a cancelled
// subscription can't be suspended. Each is recorded in the organization's log.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancel, getSubscription, liftSuspension, suspend } from "../../src/subscriptions/index.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = testNow;
const superAdmin = { userId: "0199e7a0-0000-7000-8000-00000000ad09" };

describe("access ended by hand", () => {
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

  it("suspends a paid-up organization at once, once, and lifting it leaves it where its lifecycle is", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    const reason = { organizationId, reason: "Chargeback" };
    expect(await inPlatform((tx) => suspend(tx, byAdmin, reason, now))).toMatchObject({
      status: "suspended",
      access: "export_only",
      nextChangeOn: null,
      recorded: { status: "active" },
      manualSuspension: { by: adminUserId, reason: "Chargeback" },
    });
    await inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Again" }, now));
    expect(
      await inPlatform((tx) => liftSuspension(tx, superAdmin, { organizationId, reason: "Bank confirmed" }, now)),
    ).toMatchObject({ status: "active", manualSuspension: null, nextChangeOn: "2027-01-01" });
    await inPlatform((tx) => liftSuspension(tx, superAdmin, { organizationId, reason: "Again" }, now));
    expect(
      (await subscriptionEntries(test, organizationId))
        .filter((entry) => entry.action !== "subscription.started")
        .map((entry) => [entry.action, entry.actorUserId, entry.before, entry.after]),
    ).toEqual([
      ["subscription.suspended", adminUserId, { status: "active" }, { status: "suspended", reason: "Chargeback" }],
      [
        "subscription.suspension-lifted",
        superAdmin.userId,
        { status: "suspended", reason: "Chargeback" },
        { status: "active", reason: "Bank confirmed" },
      ],
    ]);
  });

  it("cancels, keeping a suspension made by hand, and refuses to suspend a cancelled subscription", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, {}, { now });
    await inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Unpaid since August" }, now));
    expect(await inPlatform((tx) => cancel(tx, byAdmin, { organizationId, reason: "Left us" }, now))).toMatchObject({
      status: "cancelled",
      access: "locked",
      since: "2026-10-16",
      recorded: { status: "cancelled", since: "2026-10-16" },
      manualSuspension: { reason: "Unpaid since August" },
    });
    await expect(
      inPlatform((tx) => liftSuspension(tx, superAdmin, { organizationId, reason: "Cleared" }, now)),
    ).resolves.toMatchObject({ status: "cancelled", manualSuspension: null });
    await expect(
      inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Again" }, now)),
    ).rejects.toMatchObject({ reason: "SUBSCRIPTION_CANCELLED" });
    expect((await subscriptionEntries(test, organizationId)).map((entry) => entry.action)).toEqual([
      "subscription.started",
      "subscription.suspended",
      "subscription.cancelled",
      "subscription.suspension-lifted",
    ]);
    expect(await inPlatform((tx) => getSubscription(tx, organizationId, now))).toMatchObject({ status: "cancelled" });
  });
});
