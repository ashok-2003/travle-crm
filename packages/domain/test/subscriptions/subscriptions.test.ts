// The console's changes to an organization's subscription (spec 7.2, 7.3): each is recorded in that organization's
// log under the platform admin's name, a change to the same values records nothing, and the dates are read in the
// organization's own time zone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancel,
  changePlan,
  getSubscription,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  startSubscription,
  suspend,
} from "../../src/subscriptions/index.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { archivePlan } from "../../src/subscriptions/index.js";
import { createTestOrganization } from "@travel-crm/db/testing";

/** 00:30 on 17 October in India, still 16 October in UTC. */
const justAfterMidnightInIndia = new Date("2026-10-16T19:00:00Z");

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
      {
        trialEndsOn: "2026-10-30",
        paidThrough: null,
      },
      { now: justAfterMidnightInIndia },
    );
    expect(await inPlatform((tx) => getSubscription(tx, organizationId))).toMatchObject({
      plan: { id: starter.id, key: starter.key, name: "Starter" },
      status: "trial",
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

  it("reads today in the organization's time zone, refusing a trial that ended yesterday there", async () => {
    // Already 17 October in India: a trial to the 16th is over.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        {
          now: justAfterMidnightInIndia,
        },
      ),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    // Still 16 October in London.
    await expect(
      createSubscribedOrganization(
        test,
        starter,
        { trialEndsOn: "2026-10-16", paidThrough: null },
        {
          now: justAfterMidnightInIndia,
          timeZone: "Europe/London",
        },
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

  it("gives each organization one subscription", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) =>
        startSubscription(tx, byAdmin, {
          organizationId,
          planId: growth.id,
          billingCycle: "yearly",
          trialEndsOn: null,
          paidThrough: "2099-12-31",
        }),
      ),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("changes the plan and billing cycle, and records nothing for the same ones again", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const changed = await inPlatform((tx) =>
      changePlan(tx, byAdmin, { organizationId, planId: growth.id, billingCycle: "yearly" }),
    );
    expect(changed).toMatchObject({ plan: { id: growth.id }, billingCycle: "yearly" });
    await inPlatform((tx) => changePlan(tx, byAdmin, { organizationId, planId: growth.id, billingCycle: "yearly" }));
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

  it("sets overrides: extra seats, an agreed price and modules switched on early", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const overridden = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, {
        organizationId,
        extraSeats: 3,
        customPricePaise: 0,
        extraModules: ["accounts", "bookings", "accounts"],
      }),
    );
    expect(overridden).toMatchObject({ extraSeats: 3, customPricePaise: 0, extraModules: ["accounts", "bookings"] });
    const entries = await subscriptionEntries(test, organizationId);
    expect(entries.at(-1)).toMatchObject({
      action: "subscription.overrides-changed",
      before: { extraSeats: 0, customPricePaise: null, extraModules: [] },
    });
  });

  it("moves a trial's end only during the trial, and not into the past", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      {
        trialEndsOn: "2026-10-30",
        paidThrough: null,
      },
      { now: justAfterMidnightInIndia },
    );
    const now = justAfterMidnightInIndia;
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-10-16" }, now)),
    ).rejects.toMatchObject({ reason: "TRIAL_END_IN_PAST" });
    expect(
      await inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId, trialEndsOn: "2026-11-15" }, now)),
    ).toMatchObject({ status: "trial", trialEndsOn: "2026-11-15" });
    const paying = await createSubscribedOrganization(test, starter);
    await expect(
      inPlatform((tx) => setTrialEnd(tx, byAdmin, { organizationId: paying, trialEndsOn: "2026-11-15" }, now)),
    ).rejects.toMatchObject({ reason: "NOT_IN_TRIAL" });
  });

  it("suspends and cancels by hand, and brings an organization back once it is paid through today", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const now = justAfterMidnightInIndia;
    expect(
      await inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Unpaid since August" }, now)),
    ).toMatchObject({ status: "suspended" });
    expect(await inPlatform((tx) => cancel(tx, byAdmin, { organizationId, reason: "Left us" }, now))).toMatchObject({
      status: "cancelled",
    });
    await expect(
      inPlatform((tx) => suspend(tx, byAdmin, { organizationId, reason: "Again" }, now)),
    ).rejects.toMatchObject({ reason: "SUBSCRIPTION_CANCELLED" });
    // A day already past changes nothing; from today on, the organization is back.
    expect(
      await inPlatform((tx) =>
        setPaidThrough(tx, byAdmin, { organizationId, paidThrough: "2026-10-16", reason: "Correction" }, now),
      ),
    ).toMatchObject({ status: "cancelled", paidThrough: "2026-10-16" });
    expect(
      await inPlatform((tx) =>
        setPaidThrough(tx, byAdmin, { organizationId, paidThrough: "2026-10-17", reason: "Came back" }, now),
      ),
    ).toMatchObject({ status: "active", paidThrough: "2026-10-17" });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.paid-through-changed",
      after: { paidThrough: "2026-10-17", status: "active", reason: "Came back" },
    });
  });

  it("says when an organization has no subscription", async () => {
    const organizationId = await createTestOrganization(test.platform, "Unsubscribed");
    await expect(inPlatform((tx) => getSubscription(tx, organizationId))).rejects.toMatchObject({
      reason: "SUBSCRIPTION_NOT_FOUND",
    });
  });

  it("can't change a subscription as the runtime role, whatever the code does", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        setOverrides(tx, byAdmin, { organizationId, extraSeats: 100, customPricePaise: 0, extraModules: [] }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
