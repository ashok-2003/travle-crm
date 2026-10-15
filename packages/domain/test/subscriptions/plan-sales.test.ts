// Which plan an organization may be put on (spec 7.2, 7.4): the demo's own plan is never offered nor taken at
// onboarding, only by the platform's demo job; and a plan keeps its price for every cycle an organization pays it on,
// even when the change races a move onto that cycle.
import type { PlanSummary, UpdatePlanInput } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changePlan,
  DEMO_PLAN_KEY,
  demoPlan,
  listPlans,
  startSubscription,
  updatePlan,
} from "../../src/subscriptions/index.js";
import { waitUntilBlockedBy } from "../lock-waits.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  holdOpen,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = testNow;

describe("plans on sale", () => {
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
  /** The plan as it is, but sold monthly only. */
  const monthlyOnly = (fields: PlanSummary): UpdatePlanInput => ({
    planId: fields.id,
    name: fields.name,
    monthlyPricePaise: fields.monthlyPricePaise,
    yearlyPricePaise: null,
    extraSeatMonthlyPricePaise: fields.extraSeatMonthlyPricePaise,
    extraSeatYearlyPricePaise: null,
    seatLimit: fields.seatLimit,
    whatsappNumberLimit: fields.whatsappNumberLimit,
    storageLimitBytes: fields.storageLimitBytes,
    modules: fields.modules,
  });

  it("never offers or takes the demo's plan at onboarding; only the platform's demo job puts an organization on it", async () => {
    const demo = await inPlatform((tx) => demoPlan(tx));
    expect(demo).toMatchObject({ key: DEMO_PLAN_KEY, forSale: false, archived: false });
    expect((await inPlatform((tx) => demoPlan(tx))).id).toBe(demo.id);
    const onSale = await inPlatform((tx) => listPlans(tx, { includeArchived: false }));
    expect(onSale.map((listed) => listed.id)).not.toContain(demo.id);
    const start = (organizationId: string) => ({
      organizationId,
      planId: demo.id,
      billingCycle: "monthly" as const,
      trialEndsOn: null,
      paidThrough: "2026-11-15",
    });
    const onboarded = await createTestOrganization(test.platform, "Onboarded");
    await expect(inPlatform((tx) => startSubscription(tx, byAdmin, start(onboarded), now))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "PLAN_NOT_FOR_SALE",
    });
    const theDemo = await createTestOrganization(test.platform, "Demo Holidays");
    await expect(
      inPlatform((tx) => startSubscription(tx, { userId: null }, start(theDemo), now)),
    ).resolves.toMatchObject({ plan: { id: demo.id }, status: "active", price: { totalPaise: 0 } });
    const agency = await createSubscribedOrganization(test, plan);
    await expect(
      inPlatform((tx) =>
        changePlan(tx, { userId: null }, { organizationId: agency, planId: demo.id, billingCycle: "monthly" }, now),
      ),
    ).rejects.toMatchObject({ reason: "PLAN_NOT_FOR_SALE" });
  });

  it("keeps a cycle's price while an organization pays the plan that way", async () => {
    const priced = await createTestPlan(test);
    await createSubscribedOrganization(test, priced, { billingCycle: "yearly" });
    await expect(inPlatform((tx) => updatePlan(tx, monthlyOnly(priced)))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "PLAN_CYCLE_IN_USE",
    });
  });

  it("refuses to drop a cycle's price that an organization is being moved onto at the same moment", async () => {
    const priced = await createTestPlan(test);
    const organizationId = await createSubscribedOrganization(test, priced);
    // The move to yearly holds its transaction open; the price change runs into it.
    const held = holdOpen();
    const moving = inPlatform(async (tx) => {
      await changePlan(tx, byAdmin, { organizationId, planId: priced.id, billingCycle: "yearly" }, now);
      await held.pause(tx);
    });
    const pid = await held.pid;
    const dropping = inPlatform((tx) => updatePlan(tx, monthlyOnly(priced)));
    await waitUntilBlockedBy(test.platform, pid);
    held.release();
    await moving;
    await expect(dropping).rejects.toMatchObject({ reason: "PLAN_CYCLE_IN_USE" });
  });
});
