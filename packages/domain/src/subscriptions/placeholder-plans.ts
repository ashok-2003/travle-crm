// Placeholder tiers for the demo reset and for tests, never for production: there, super admins enter the real plans
// in the console (plans are data, spec 7.2), and no migration seeds one. The tiers' seats and storage are the owner's;
// every price is a PLACEHOLDER until the owner confirms it (spec Q4).
import type { CreatePlanInput, PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { planColumns } from "./plans.js";
import { planSummaryOf } from "./rows.js";

const GIGABYTE = 1024 ** 3;

/** An extra seat: ₹299 a month, ₹2,990 a year (PLACEHOLDER), on every tier. */
const extraSeat = { extraSeatMonthlyPricePaise: 29_900, extraSeatYearlyPricePaise: 299_000 } as const;

/**
 * Starter, Growth and Pro: 3, 10 and 25 seats; 5, 25 and 100 GB. PLACEHOLDER prices before 18 % GST: ₹1,999, ₹4,999
 * and ₹9,999 a month, the yearly price ten months'; the WhatsApp numbers and modules are placeholders too.
 */
export const placeholderPlans: readonly CreatePlanInput[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPricePaise: 199_900,
    yearlyPricePaise: 1_999_000,
    ...extraSeat,
    seatLimit: 3,
    whatsappNumberLimit: 1,
    storageLimitBytes: 5 * GIGABYTE,
    modules: ["crm", "inbox", "catalog", "quotes"],
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPricePaise: 499_900,
    yearlyPricePaise: 4_999_000,
    ...extraSeat,
    seatLimit: 10,
    whatsappNumberLimit: 2,
    storageLimitBytes: 25 * GIGABYTE,
    modules: ["crm", "inbox", "catalog", "quotes", "bookings", "departures", "suppliers"],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPricePaise: 999_900,
    yearlyPricePaise: 9_999_000,
    ...extraSeat,
    seatLimit: 25,
    whatsappNumberLimit: 5,
    storageLimitBytes: 100 * GIGABYTE,
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
    const row = await tx.plan.upsert({ where: { key: plan.key }, create: planColumns(plan), update: {} });
    seeded.push(planSummaryOf(row));
  }
  return seeded;
}
