// Starting an organization's subscription and changing its plan and overrides from the console (spec 7.1, 7.2): each
// is recorded in that organization's log under the platform admin's name, a change to the same values records
// nothing, and dates are read in the organization's own time zone. What the console sees: details.test.ts.
import type { PlanSummary, SetOverridesInput } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archivePlan,
  changePlan,
  getSubscription,
  setOverrides,
  startSubscription,
} from "../../src/subscriptions/index.js";
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

/** 00:30 on 17 October in India, still 16 October in UTC. */
const justAfterMidnightInIndia = new Date("2026-10-16T19:00:00Z");
const now = testNow;

describe("subscriptions", () => {
  let test: TestSubscriptions;
  let starter: PlanSummary;
  let growth: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    starter = await createTestPlan(test, { name: "Starter" });
    growth = await createTestPlan(test, { name: "Growth", modules: ["crm", "quotes", "bookings"] });
  });

  afterAll(async () => {
    await test.close();
  });

  const inPlatform = <T>(fn: Parameters<typeof test.platformDb.transaction<T>>[0]) => test.platformDb.transaction(fn);

  it("starts on a trial, recorded under the platform admin's name", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      { trialEndsOn: "2026-10-30", paidThrough: null },
      { now: justAfterMidnightInIndia },
    );
    expect(await inPlatform((tx) => getSubscription(tx, organizationId, justAfterMidnightInIndia))).toMatchObject({
      plan: { id: starter.id, key: starter.key, name: "Starter" },
      status: "trial",
      since: "2026-10-17",
      trialEndsOn: "2026-10-30",
      paidThrough: null,
    });
    expect(await subscriptionEntries(test, organizationId)).toEqual([
      expect.objectContaining({
        action: "subscription.started",
        actorUserId: adminUserId,
        source: "platform",
        entityId: organizationId,
        after: {
          plan: starter.key,
          billingCycle: "monthly",
          status: "trial",
          trialEndsOn: "2026-10-30",
          paidThrough: null,
        },
      }),
    ]);
  });

  it("starts a trial of the policy's 7 days, today included, when no end is given", async () => {
    const organizationId = await createTestOrganization(test.platform, "Trial by policy");
    const started = await inPlatform((tx) =>
      startSubscription(
        tx,
        byAdmin,
        { organizationId, planId: starter.id, billingCycle: "yearly", paidThrough: null },
        now,
      ),
    );
    expect(started).toMatchObject({ status: "trial", billingCycle: "yearly", trialEndsOn: "2026-10-22" });
  });

  it("reads today in the organization's time zone, refusing a trial that ended yesterday there", async () => {
    // Already 17 October in India: a trial to the 16th is over.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        { now: justAfterMidnightInIndia },
      ),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    // Still 16 October in London.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        { now: justAfterMidnightInIndia, timeZone: "Europe/London" },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("starts active only when paid through today or later, and never on an archived plan", async () => {
    await expect(
      createSubscribedOrganization(test, starter, { paidThrough: null }, { now: justAfterMidnightInIndia }),
    ).rejects.toMatchObject({ reason: "PAID_THROUGH_REQUIRED" });
    const retired = await createTestPlan(test);
    await inPlatform((tx) => archivePlan(tx, retired.id));
    await expect(createSubscribedOrganization(test, retired)).rejects.toMatchObject({ reason: "PLAN_ARCHIVED" });
  });

  it("refuses a second subscription for an organization as a conflict", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) =>
        startSubscription(
          tx,
          byAdmin,
          { organizationId, planId: growth.id, billingCycle: "monthly", trialEndsOn: null, paidThrough: "2027-01-31" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "SUBSCRIPTION_EXISTS" });
  });

  it("changes the plan and billing cycle, and records nothing for the same ones again", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const change = { organizationId, planId: growth.id, billingCycle: "yearly" } as const;
    const changed = await inPlatform((tx) => changePlan(tx, byAdmin, change, now));
    expect(changed).toMatchObject({ plan: { id: growth.id }, billingCycle: "yearly" });
    await inPlatform((tx) => changePlan(tx, byAdmin, change, now));
    expect(
      (await subscriptionEntries(test, organizationId)).map((entry) => [entry.action, entry.before, entry.after]),
    ).toEqual([
      ["subscription.started", null, expect.anything()],
      [
        "subscription.plan-changed",
        { plan: starter.key, billingCycle: "monthly" },
        { plan: growth.key, billingCycle: "yearly" },
      ],
    ]);
  });

  it("sells a plan only the ways it is priced", async () => {
    const monthlyOnly = await createTestPlan(test, { yearlyPricePaise: null });
    await expect(createSubscribedOrganization(test, monthlyOnly, { billingCycle: "yearly" })).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "NOT_SOLD_YEARLY",
    });
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) =>
        changePlan(tx, byAdmin, { organizationId, planId: monthlyOnly.id, billingCycle: "yearly" }, now),
      ),
    ).rejects.toMatchObject({ reason: "NOT_SOLD_YEARLY" });
  });

  it("sets overrides: extra seats, an agreed price and modules switched on early", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const overrides: SetOverridesInput = {
      organizationId,
      extraSeats: 3,
      customPricePaise: 0,
      extraModules: ["accounts", "bookings", "accounts"],
    };
    const overridden = await inPlatform((tx) => setOverrides(tx, byAdmin, overrides, now));
    expect(overridden).toMatchObject({ extraSeats: 3, customPricePaise: 0, extraModules: ["accounts", "bookings"] });
    await inPlatform((tx) => setOverrides(tx, byAdmin, overrides, now));
    const entries = await subscriptionEntries(test, organizationId);
    expect(entries.filter((entry) => entry.action === "subscription.overrides-changed")).toEqual([
      expect.objectContaining({ before: { extraSeats: 0, customPricePaise: null, extraModules: [] } }),
    ]);
  });

  it("says when an organization has no subscription", async () => {
    const organizationId = await createTestOrganization(test.platform, "Unsubscribed");
    await expect(inPlatform((tx) => getSubscription(tx, organizationId, now))).rejects.toMatchObject({
      reason: "SUBSCRIPTION_NOT_FOUND",
    });
  });

  it("can't change a subscription as the runtime role, whatever the code does", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        setOverrides(tx, byAdmin, { organizationId, extraSeats: 100, customPricePaise: 0, extraModules: [] }, now),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
