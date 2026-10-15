// Every journey's agency is on a plan with every module, active and paid for a year, as onboarding (plan 4) leaves it:
// without a subscription, request check 2 refuses the agency's every call.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { isUniqueViolation } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";

/** The key of the plan journeys' agencies are on, the api tests' own. */
export const EVERYTHING_PLAN_KEY = "test-everything";

const everythingPlan = {
  key: EVERYTHING_PLAN_KEY,
  name: "Everything (tests)",
  monthlyPricePaise: 0,
  seatLimit: 1000,
  whatsappNumberLimit: 10,
  storageLimitBytes: 1_000_000_000_000n,
  modules: [...planModules],
};

/** The plan's id. Journeys run at once, so another may create the plan between the look and the create. */
async function everythingPlanId(platform: PlatformClient): Promise<string> {
  const existing = await platform.plan.findUnique({ where: { key: everythingPlan.key }, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await platform.plan.create({ data: everythingPlan, select: { id: true } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await platform.plan.findUniqueOrThrow({ where: { key: everythingPlan.key }, select: { id: true } })).id;
  }
}

/** Puts the organization on the plan, active and paid for a year from today. */
export async function subscribeToEverything(platform: PlatformClient, organizationId: string): Promise<void> {
  await platform.subscription.create({
    data: {
      organizationId,
      planId: await everythingPlanId(platform),
      billingCycle: "monthly",
      status: "active",
      statusChangedAt: new Date(),
      paidThrough: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}
