// Plans as quoted: a plan sold for 3 months, the AI credits each plan gives an agency every month (the one statement
// that spends them takes the plan's limit), and the GST on subscriptions, which changes only the price shown.
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthlyAiLimitOf, MONTHLY_AI_LIMIT } from "../../src/ai/index.js";
import { releaseAiCall, reserveAiCall, usedThisMonth } from "../../src/ai/usage.js";
import {
  changePlan,
  getSubscription,
  recordPayment,
  setSubscriptionPolicy,
  updatePlan,
} from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const timeZone = "Asia/Kolkata";

describe("plans as quoted", () => {
  let test: TestSubscriptions;

  beforeAll(() => {
    test = createTestSubscriptions();
  });

  afterAll(async () => {
    await test.close();
  });

  it("sells a plan priced only for 3 months that way, and refuses it monthly", async () => {
    const plan = await createTestPlan(test, {
      monthlyPricePaise: null,
      yearlyPricePaise: null,
      quarterlyPricePaise: 1_199_900,
      extraSeatMonthlyPricePaise: null,
      extraSeatYearlyPricePaise: null,
    });
    expect(plan).toMatchObject({ quarterlyPricePaise: 1_199_900, monthlyPricePaise: null, aiCreditsPerMonth: 10_000 });
    const organizationId = await createSubscribedOrganization(test, plan, { billingCycle: "quarterly" });
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId, testNow))).toMatchObject({
      billingCycle: "quarterly",
      price: { cycle: "quarterly", basePaise: 1_199_900 },
    });
    await expect(createSubscribedOrganization(test, plan, { billingCycle: "monthly" })).rejects.toMatchObject({
      reason: "NOT_SOLD_MONTHLY",
    });
  });

  it("keeps a plan's 3-month price while an organization pays it that way", async () => {
    const plan = await createTestPlan(test, { quarterlyPricePaise: 700_000 });
    await createSubscribedOrganization(test, plan, { billingCycle: "quarterly" });
    await expect(
      test.platformDb.transaction((tx) =>
        updatePlan(tx, {
          planId: plan.id,
          name: plan.name,
          monthlyPricePaise: plan.monthlyPricePaise,
          quarterlyPricePaise: null,
          yearlyPricePaise: plan.yearlyPricePaise,
          aiCreditsPerMonth: plan.aiCreditsPerMonth,
          seatLimit: plan.seatLimit,
          whatsappNumberLimit: plan.whatsappNumberLimit,
          storageLimitBytes: plan.storageLimitBytes,
          modules: plan.modules,
        }),
      ),
    ).rejects.toMatchObject({ reason: "PLAN_CYCLE_IN_USE" });
  });

  it("gives each agency its own plan's AI credits, and 10,000 with no subscription", async () => {
    const starter = await createTestPlan(test, { aiCreditsPerMonth: 10_000 });
    const growth = await createTestPlan(test, { aiCreditsPerMonth: 20_000 });
    const starterOrganization = await createSubscribedOrganization(test, starter);
    const growthOrganization = await createSubscribedOrganization(test, growth);
    expect(await test.db.forOrg(starterOrganization, (tx) => monthlyAiLimitOf(tx))).toBe(10_000);
    expect(await test.db.forOrg(growthOrganization, (tx) => monthlyAiLimitOf(tx))).toBe(20_000);
    const bare = await createTestOrganization(test.platform, "No subscription");
    expect(await test.db.forOrg(bare, (tx) => monthlyAiLimitOf(tx))).toBe(MONTHLY_AI_LIMIT);
  });

  it("refuses the call past the plan's credits, two asking at once included, and gives one back", async () => {
    const small = await createTestPlan(test, { aiCreditsPerMonth: 3 });
    const large = await createTestPlan(test, { aiCreditsPerMonth: 5 });
    const smallOrganization = await createSubscribedOrganization(test, small);
    const largeOrganization = await createSubscribedOrganization(test, large);
    const reserve = (organizationId: string) =>
      test.db.forOrg(organizationId, (tx) => reserveAiCall(tx, testNow, timeZone));
    // Two at once, then two more: three of the four get a credit on the 3-credit plan.
    const first = await Promise.all([reserve(smallOrganization), reserve(smallOrganization)]);
    const second = await Promise.all([reserve(smallOrganization), reserve(smallOrganization)]);
    expect([...first, ...second].filter(Boolean)).toHaveLength(3);
    expect(await test.db.forOrg(smallOrganization, (tx) => usedThisMonth(tx, testNow, timeZone))).toBe(3);
    // The same four calls on the 5-credit plan all get one.
    const four = await Promise.all([1, 2, 3, 4].map(() => reserve(largeOrganization)));
    expect(four).toEqual([true, true, true, true]);
    // A credit given back is there to take again; a bigger plan takes effect at once.
    await test.db.forOrg(smallOrganization, (tx) => releaseAiCall(tx, testNow, timeZone));
    expect(await reserve(smallOrganization)).toBe(true);
    expect(await reserve(smallOrganization)).toBe(false);
    await test.platformDb.transaction((tx) =>
      changePlan(
        tx,
        byAdmin,
        { organizationId: smallOrganization, planId: large.id, billingCycle: "monthly" },
        testNow,
      ),
    );
    expect(await reserve(smallOrganization)).toBe(true);
  });

  it("changes only the shown breakdown when the GST on subscriptions goes from 0 to 18 %, never a recorded payment", async () => {
    const plan = await createTestPlan(test);
    const organizationId = await createSubscribedOrganization(test, plan);
    const sentinel = new Error("roll back: the policy row is shared with other test files");
    await expect(
      test.platformDb.transaction(async (tx) => {
        const payment = await recordPayment(
          tx,
          byAdmin,
          { organizationId, amountPaise: 250_000, paidOn: "2026-10-16", paidThrough: "2026-11-15", reference: null },
          { now: testNow },
        );
        const before = await getSubscription(tx, organizationId, testNow);
        expect(before.price).toMatchObject({ gstPaise: 0, totalPaise: 250_000 });
        const policy = { trialDays: 7, pastDueDays: 7, readOnlyDays: 14, subscriptionGstBasisPoints: 1800 as const };
        await setSubscriptionPolicy(tx, byAdmin, policy);
        const after = await getSubscription(tx, organizationId, testNow);
        expect(after.price).toMatchObject({ subtotalPaise: 250_000, gstPaise: 45_000, totalPaise: 295_000 });
        const recorded = await tx.subscriptionPayment.findUniqueOrThrow({
          where: { organizationId_id: { organizationId, id: payment.id } },
        });
        expect(recorded.amountPaise).toBe(250_000);
        throw sentinel;
      }),
    ).rejects.toBe(sentinel);
  });
});
