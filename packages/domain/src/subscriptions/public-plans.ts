// The plans the product's public pricing page lists (spec 7.2: plans are data the console edits): those on sale and not
// archived, cheapest first, with only what a visitor may see. Plans belong to no organization, so they are read with
// none set.
import type { PublicPlan } from "@travel-crm/contracts/subscriptions";
import type { Database } from "@travel-crm/db";
import { listPlans } from "./plans.js";

/** What a plan costs a month, for ordering: its monthly price, or a twelfth of its yearly one. */
const monthlyCost = (plan: PublicPlan): number =>
  plan.monthlyPricePaise ?? Math.round((plan.yearlyPricePaise ?? 0) / 12);

export async function plansOnSale(db: Database): Promise<PublicPlan[]> {
  const plans = await db.withoutOrg((tx) => listPlans(tx, { includeArchived: false }));
  return plans
    .map((plan): PublicPlan => ({
      key: plan.key,
      name: plan.name,
      monthlyPricePaise: plan.monthlyPricePaise,
      yearlyPricePaise: plan.yearlyPricePaise,
      extraSeatMonthlyPricePaise: plan.extraSeatMonthlyPricePaise,
      extraSeatYearlyPricePaise: plan.extraSeatYearlyPricePaise,
      seatLimit: plan.seatLimit,
      whatsappNumberLimit: plan.whatsappNumberLimit,
      storageLimitBytes: plan.storageLimitBytes,
      modules: plan.modules,
    }))
    .sort((first, second) => monthlyCost(first) - monthlyCost(second) || first.name.localeCompare(second.name));
}
