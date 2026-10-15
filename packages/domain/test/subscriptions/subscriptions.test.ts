// Starting an organization's subscription and changing its plan and overrides from the console (spec 7.1, 7.2): each
// is recorded in that organization's log under the platform admin's name, a change to the same values records
// nothing, dates are read in the organization's own time zone, and the console sees the state due today beside the
// one recorded, with the price.
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

  it("starts the policy's trial when no last day is given: 7 days from today", async () => {
    const organizationId = await createTestOrganization(test.platform, "Trial by policy");
    const started = await inPlatform((tx) =>
      startSubscription(
        tx,
        byAdmin,
        { organizationId, planId: starter.id, billingCycle: "annual", paidThrough: null },
        now,
      ),
    );
    expect(started).toMatchObject({ status: "trial", billingCycle: "annual", trialEndsOn: "2026-10-23" });
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
    const change = { organizationId, planId: growth.id, billingCycle: "annual" } as const;
    const changed = await inPlatform((tx) => changePlan(tx, byAdmin, change, now));
    expect(changed).toMatchObject({ plan: { id: growth.id }, billingCycle: "annual" });
    await inPlatform((tx) => changePlan(tx, byAdmin, change, now));
    expect(
      (await subscriptionEntries(test, organizationId)).map((entry) => [entry.action, entry.before, entry.after]),
    ).toEqual([
      ["subscription.started", null, expect.anything()],
      [
        "subscription.plan-changed",
        { plan: starter.key, billingCycle: "monthly" },
        { plan: growth.key, billingCycle: "annual" },
      ],
    ]);
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

  it("shows the price per billing cycle before GST, its extra seats, and GST at 18 % on top", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const withSeats = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: null, extraModules: [] }, now),
    );
    // ₹2,500 a month and two seats at ₹500: ₹3,500, and GST of ₹630.
    expect(withSeats.price).toEqual({
      billingCycle: "monthly",
      planPricePaise: 250_000,
      extraSeats: 2,
      extraSeatPricePaise: 50_000,
      listPricePaise: 350_000,
      customPricePaise: null,
      pricePaise: 350_000,
      gstRateBasisPoints: 1800,
      gstPaise: 63_000,
      totalPaise: 413_000,
    });
    const agreed = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: 299_999, extraModules: [] }, now),
    );
    expect(agreed.price).toMatchObject({ listPricePaise: 350_000, pricePaise: 299_999, gstPaise: 54_000 });
  });

  it("shows the state due today, and what the daily job last recorded", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      { trialEndsOn: "2026-10-10", paidThrough: null },
      { now: new Date("2026-10-01T06:00:00Z") },
    );
    expect(await inPlatform((tx) => getSubscription(tx, organizationId, now))).toMatchObject({
      status: "past_due",
      access: "full",
      since: "2026-10-11",
      nextChangeOn: "2026-10-18",
      recorded: { status: "trial", since: "2026-10-01" },
      manualSuspension: null,
    });
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
