// What an organization pays per billing cycle (spec 7.2, the owner's pricing): its plan's price for the cycle and its
// extra seats', or the price agreed in their place, before GST; GST goes on top and is shown separately. In paise,
// through the kernel's money, so nothing is computed with a float. Shown in the console only, never to the agency's
// staff (subscription.get carries no price).
import type { BillingCycle, SubscriptionPrice } from "@travel-crm/contracts/subscriptions";
import { add, money, multiply, percentageOf } from "../kernel/index.js";
import type { PlanRow } from "./rows.js";

/** GST on the platform's subscriptions: 18 %, as basis points. */
export const SUBSCRIPTION_GST_RATE_BASIS_POINTS = 1800;

/**
 * The price for one billing cycle. GST is rounded half-up to the paisa on the whole price, as the kernel's GST engine
 * rounds a line's IGST. The invoice (online billing, later) splits it into CGST and SGST, or IGST, by the platform's
 * and the agency's states, through that engine.
 */
export function priceOf(
  plan: Pick<
    PlanRow,
    "monthlyPricePaise" | "annualPricePaise" | "extraSeatMonthlyPricePaise" | "extraSeatAnnualPricePaise"
  >,
  subscription: { billingCycle: BillingCycle; extraSeats: number; customPricePaise: number | null },
): SubscriptionPrice {
  const annual = subscription.billingCycle === "annual";
  const planPrice = money(annual ? plan.annualPricePaise : plan.monthlyPricePaise);
  const extraSeatPrice = money(annual ? plan.extraSeatAnnualPricePaise : plan.extraSeatMonthlyPricePaise);
  const listPrice = add(planPrice, multiply(extraSeatPrice, subscription.extraSeats));
  const price = subscription.customPricePaise === null ? listPrice : money(subscription.customPricePaise);
  const gst = percentageOf(price, SUBSCRIPTION_GST_RATE_BASIS_POINTS);
  return {
    billingCycle: subscription.billingCycle,
    planPricePaise: planPrice.amountPaise,
    extraSeats: subscription.extraSeats,
    extraSeatPricePaise: extraSeatPrice.amountPaise,
    listPricePaise: listPrice.amountPaise,
    customPricePaise: subscription.customPricePaise,
    pricePaise: price.amountPaise,
    gstRateBasisPoints: SUBSCRIPTION_GST_RATE_BASIS_POINTS,
    gstPaise: gst.amountPaise,
    totalPaise: add(price, gst).amountPaise,
  };
}
