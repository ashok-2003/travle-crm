// A plan's prices as the console offers it: the billing cycles it is sold on (those it has a price for), and its
// price for each, before GST.
import type { BillingCycle, PlanSummary } from "@travel-crm/contracts/subscriptions";

const billingCycles: readonly BillingCycle[] = ["monthly", "yearly"];

/** The plan's flat price for a cycle, in paise, or null when it isn't sold that way. */
export function priceOf(plan: Pick<PlanSummary, "monthlyPricePaise" | "yearlyPricePaise">, cycle: BillingCycle) {
  return cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
}

/** The cycles the plan is sold on, monthly first. */
export function cyclesOf(plan: Pick<PlanSummary, "monthlyPricePaise" | "yearlyPricePaise">): BillingCycle[] {
  return billingCycles.filter((cycle) => priceOf(plan, cycle) !== null);
}
