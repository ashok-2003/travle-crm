// A plan's prices as the console offers it: the billing cycles it is sold on (those it has a price for), and its
// price for each, before GST.
import type { BillingCycle, PlanSummary } from "@travel-crm/contracts/subscriptions";

const billingCycles: readonly BillingCycle[] = ["monthly", "quarterly", "yearly"];
type Prices = Pick<PlanSummary, "monthlyPricePaise" | "quarterlyPricePaise" | "yearlyPricePaise">;

/** The plan's flat price for a cycle, in paise, or null when it isn't sold that way. */
export function priceOf(plan: Prices, cycle: BillingCycle) {
  if (cycle === "monthly") return plan.monthlyPricePaise;
  return cycle === "quarterly" ? plan.quarterlyPricePaise : plan.yearlyPricePaise;
}

/** The cycles the plan is sold on, shortest first. */
export function cyclesOf(plan: Prices): BillingCycle[] {
  return billingCycles.filter((cycle) => priceOf(plan, cycle) !== null);
}
