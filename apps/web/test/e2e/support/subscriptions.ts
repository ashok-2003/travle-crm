// Every journey's agency is on a subscription, as onboarding puts it (plan 4): request check 2 refuses an organization
// without one (NO_SUBSCRIPTION), and the app would stop at "Opening your organization". The same test plan the api's
// tests use (apps/api/test/support/test-server.ts), copied: no package both can import may name the plan modules
// (@travel-crm/db/testing knows nothing of the contracts).
import { planModules } from "@travel-crm/contracts/subscriptions";
import { isUniqueViolation } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";

/** Every module, and room to spare: no journey runs into a plan's limit. */
const everythingPlan = {
  key: "test-everything",
  name: "Everything (tests)",
  monthlyPricePaise: 0,
  seatLimit: 1000,
  whatsappNumberLimit: 10,
  storageLimitBytes: 1_000_000_000_000n,
  modules: [...planModules],
};

/** The test plan's id. Journeys run at once, so another may create the plan between the look and the create. */
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

/** Puts the organization on the test plan, active and paid for a year from today, as onboarding would have. */
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
