// What a subscription costs per billing cycle (spec 7.2, 7.4): a flat price per organization, the plan's or one agreed
// for it, plus the seats bought above the plan's at its seat price; all before GST, with the GST shown apart. In
// paise through the kernel's money, so nothing is computed with a float. Shown in the console only, never to the
// agency's staff (subscription.get carries no price).
import type { BillingCycle, PlanSummary, SubscriptionPrice } from "@travel-crm/contracts/subscriptions";
import { add, DomainError, fractionOf, money, multiply } from "../kernel/index.js";

type CyclePrices = Pick<PlanSummary, "monthlyPricePaise" | "quarterlyPricePaise" | "yearlyPricePaise">;
type PlanPrices = CyclePrices &
  Pick<PlanSummary, "extraSeatMonthlyPricePaise" | "extraSeatQuarterlyPricePaise" | "extraSeatYearlyPricePaise">;

/** The plan's flat price for a cycle, or null when it isn't sold that way. */
export function planPriceFor(plan: CyclePrices, cycle: BillingCycle): number | null {
  if (cycle === "monthly") return plan.monthlyPricePaise;
  return cycle === "quarterly" ? plan.quarterlyPricePaise : plan.yearlyPricePaise;
}

function extraSeatPriceFor(plan: PlanPrices, cycle: BillingCycle): number | null {
  if (cycle === "monthly") return plan.extraSeatMonthlyPricePaise;
  return cycle === "quarterly" ? plan.extraSeatQuarterlyPricePaise : plan.extraSeatYearlyPricePaise;
}

function notSoldOn(cycle: BillingCycle): never {
  const message = "That plan isn't sold that way";
  if (cycle === "monthly") throw new DomainError("VALIDATION", "NOT_SOLD_MONTHLY", message);
  if (cycle === "quarterly") throw new DomainError("VALIDATION", "NOT_SOLD_QUARTERLY", message);
  throw new DomainError("VALIDATION", "NOT_SOLD_YEARLY", message);
}

/** Refuses a cycle the plan has no price for: a plan is sold only the ways it is priced. */
export function assertSoldOn(plan: CyclePrices, cycle: BillingCycle): void {
  if (planPriceFor(plan, cycle) === null) notSoldOn(cycle);
}

/**
 * The cycle's price: the agreed one, or else the plan's for the cycle, which must have one (NOT_SOLD_MONTHLY,
 * NOT_SOLD_QUARTERLY or NOT_SOLD_YEARLY). Extra seats on a plan that sells none that way cost nothing: the console gave them as an
 * override. GST is the policy's rate (0 while the platform charges none), split as the kernel's GST engine splits an
 * intra-state line: CGST and SGST each at half the rate, rounded half-up on its own, so the halves always add up to
 * the GST shown. (An inter-state invoice's IGST, rounded
 * once, can differ by a paisa; the invoice, with online billing later, takes the place of supply from the agency.)
 */
export function subscriptionPriceOf(
  plan: PlanPrices,
  subscription: { billingCycle: BillingCycle; extraSeats: number; customPricePaise: number | null },
  gstBasisPoints: number,
): SubscriptionPrice {
  const cycle = subscription.billingCycle;
  const basePaise = subscription.customPricePaise ?? planPriceFor(plan, cycle) ?? notSoldOn(cycle);
  const seatPrice = extraSeatPriceFor(plan, cycle) ?? 0;
  const extraSeats = multiply(money(seatPrice), subscription.extraSeats);
  const subtotal = add(money(basePaise), extraSeats);
  const half = fractionOf(subtotal, gstBasisPoints, 20_000);
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
