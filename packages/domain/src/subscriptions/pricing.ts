// What a subscription costs per billing cycle (spec 7.2, 7.4): a flat price per organization, the plan's or one agreed
// for it, plus the seats bought above the plan's at its seat price; all before GST, with the GST shown apart. In
// paise through the kernel's money, so nothing is computed with a float. Shown in the console only, never to the
// agency's staff (subscription.get carries no price).
import type { BillingCycle, PlanSummary, SubscriptionPrice } from "@travel-crm/contracts/subscriptions";
import { add, DomainError, fractionOf, money, multiply } from "../kernel/index.js";

/** GST on the platform's own subscription, in basis points: 18 %, CGST and SGST at half each. */
export const SUBSCRIPTION_GST_BASIS_POINTS = 1800;

type CyclePrices = Pick<PlanSummary, "monthlyPricePaise" | "yearlyPricePaise">;
type PlanPrices = CyclePrices & Pick<PlanSummary, "extraSeatMonthlyPricePaise" | "extraSeatYearlyPricePaise">;

/** The plan's flat price for a cycle, or null when it isn't sold that way. */
export function planPriceFor(plan: CyclePrices, cycle: BillingCycle): number | null {
  return cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
}

function notSoldOn(cycle: BillingCycle): never {
  throw new DomainError(
    "VALIDATION",
    cycle === "monthly" ? "NOT_SOLD_MONTHLY" : "NOT_SOLD_YEARLY",
    "That plan isn't sold that way",
  );
}

/** Refuses a cycle the plan has no price for: a plan is sold only the ways it is priced. */
export function assertSoldOn(plan: CyclePrices, cycle: BillingCycle): void {
  if (planPriceFor(plan, cycle) === null) notSoldOn(cycle);
}

/**
 * The cycle's price: the agreed one, or else the plan's for the cycle, which must have one (NOT_SOLD_MONTHLY or
 * NOT_SOLD_YEARLY). Extra seats on a plan that sells none that way cost nothing: the console gave them as an
 * override. GST is split as the kernel's GST engine splits an intra-state line: CGST and SGST each at half the rate,
 * rounded half-up on its own, so the halves always add up to the GST shown. (An inter-state invoice's IGST, rounded
 * once, can differ by a paisa; the invoice, with online billing later, takes the place of supply from the agency.)
 */
export function subscriptionPriceOf(
  plan: PlanPrices,
  subscription: { billingCycle: BillingCycle; extraSeats: number; customPricePaise: number | null },
): SubscriptionPrice {
  const cycle = subscription.billingCycle;
  const basePaise = subscription.customPricePaise ?? planPriceFor(plan, cycle) ?? notSoldOn(cycle);
  const seatPrice = (cycle === "monthly" ? plan.extraSeatMonthlyPricePaise : plan.extraSeatYearlyPricePaise) ?? 0;
  const extraSeats = multiply(money(seatPrice), subscription.extraSeats);
  const subtotal = add(money(basePaise), extraSeats);
  const half = fractionOf(subtotal, SUBSCRIPTION_GST_BASIS_POINTS, 20_000);
  const gst = add(half, half);
  return {
    cycle,
    basePaise,
    extraSeats: subscription.extraSeats,
    extraSeatsPaise: extraSeats.amountPaise,
    subtotalPaise: subtotal.amountPaise,
    cgstPaise: half.amountPaise,
    sgstPaise: half.amountPaise,
    gstPaise: gst.amountPaise,
    totalPaise: add(subtotal, gst).amountPaise,
  };
}
