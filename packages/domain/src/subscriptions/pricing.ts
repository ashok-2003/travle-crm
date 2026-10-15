// What a subscription costs per billing cycle (spec 7.2, 7.4): a flat price per organization, the plan's or one agreed
// for it, plus the seats bought above the plan's at its seat price; all before GST, with the GST shown apart. In
// paise through the kernel's money, so nothing is computed with a float. Shown in the console only, never to the
// agency's staff (subscription.get carries no price).
import type { BillingCycle, PlanSummary, SubscriptionPrice } from "@travel-crm/contracts/subscriptions";
import { add, DomainError, money, multiply, percentageOf } from "../kernel/index.js";

/** GST on the platform's own subscription, in basis points: 18 %. */
export const SUBSCRIPTION_GST_BASIS_POINTS = 1800;

type PlanPrices = Pick<
  PlanSummary,
  "monthlyPricePaise" | "yearlyPricePaise" | "extraSeatMonthlyPricePaise" | "extraSeatYearlyPricePaise"
>;

/** The plan's flat price for a cycle, or null when it isn't sold that way. */
export function planPriceFor(plan: PlanPrices, cycle: BillingCycle): number | null {
  return cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
}

/** Refuses a cycle the plan has no price for: a plan is sold only the ways it is priced. */
export function assertSoldOn(plan: PlanPrices, cycle: BillingCycle): void {
  if (planPriceFor(plan, cycle) === null) {
    throw new DomainError(
      "VALIDATION",
      cycle === "monthly" ? "NOT_SOLD_MONTHLY" : "NOT_SOLD_YEARLY",
      "That plan isn't sold that way",
    );
  }
}

/**
 * The cycle's price, or null when neither the plan nor an agreed price gives one. Extra seats on a plan that sells
 * none that way cost nothing: the console gave them as an override. GST is rounded half-up to the paisa on the
 * subtotal, as the kernel's GST engine rounds a line's IGST; the invoice (online billing, later) splits it into CGST
 * and SGST, or IGST, by the platform's and the agency's states, through that engine.
 */
export function subscriptionPriceOf(
  plan: PlanPrices,
  subscription: { billingCycle: BillingCycle; extraSeats: number; customPricePaise: number | null },
): SubscriptionPrice | null {
  const cycle = subscription.billingCycle;
  const basePaise = subscription.customPricePaise ?? planPriceFor(plan, cycle);
  if (basePaise === null) return null;
  const seatPrice = (cycle === "monthly" ? plan.extraSeatMonthlyPricePaise : plan.extraSeatYearlyPricePaise) ?? 0;
  const extraSeats = multiply(money(seatPrice), subscription.extraSeats);
  const subtotal = add(money(basePaise), extraSeats);
  const gst = percentageOf(subtotal, SUBSCRIPTION_GST_BASIS_POINTS);
  return {
    cycle,
    basePaise,
    extraSeats: subscription.extraSeats,
    extraSeatsPaise: extraSeats.amountPaise,
    subtotalPaise: subtotal.amountPaise,
    gstPaise: gst.amountPaise,
    totalPaise: add(subtotal, gst).amountPaise,
  };
}
