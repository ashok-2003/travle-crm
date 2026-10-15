// Placeholder tiers for the demo reset and for tests, never for production: there, super admins enter the real plans
// in the console (plans are data, spec 7.2). The tiers are the owner's (Starter, Growth, Pro: seats and storage); the
// prices and module sets are PLACEHOLDERS until the owner sets them (spec Q4).
import type { CreatePlanInput, PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { planSummaryOf } from "./rows.js";

/** PLACEHOLDER prices (paise, before GST) and module sets; the seats and storage are the owner's tiers. */
export const placeholderPlans: readonly CreatePlanInput[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPricePaise: 199_900,
    annualPricePaise: 1_999_000,
    includedSeats: 3,
    extraSeatMonthlyPricePaise: 49_900,
    extraSeatAnnualPricePaise: 499_000,
    whatsappNumberLimit: 1,
    storageGb: 5,
    modules: ["crm", "quotes"],
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPricePaise: 499_900,
    annualPricePaise: 4_999_000,
    includedSeats: 10,
    extraSeatMonthlyPricePaise: 39_900,
    extraSeatAnnualPricePaise: 399_000,
    whatsappNumberLimit: 2,
    storageGb: 25,
    modules: ["crm", "inbox", "catalog", "quotes", "bookings", "departures"],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPricePaise: 999_900,
    annualPricePaise: 9_999_000,
    includedSeats: 25,
    extraSeatMonthlyPricePaise: 29_900,
    extraSeatAnnualPricePaise: 299_000,
    whatsappNumberLimit: 5,
    storageGb: 100,
    modules: ["crm", "inbox", "catalog", "quotes", "bookings", "departures", "suppliers", "accounts", "reports"],
  },
];

/**
 * Puts the placeholder tiers on sale where their keys are free, and returns all three. A plan that already has one of
 * the keys is left exactly as it is, so running it again changes nothing. The platform role only.
 */
export async function seedPlaceholderPlans(tx: OrgTx): Promise<PlanSummary[]> {
  const seeded: PlanSummary[] = [];
  for (const plan of placeholderPlans) {
    const row = await tx.plan.upsert({ where: { key: plan.key }, create: plan, update: {} });
    seeded.push(planSummaryOf(row));
  }
  return seeded;
}
