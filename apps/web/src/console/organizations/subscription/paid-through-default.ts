// The paid-through day a payment is offered with: one billing cycle (1, 3 or 12 months) counted from the day after what
// is already paid, or from the payment's own day when nothing paid reaches it. A month that is short ends the period on
// its own last day.
import type { BillingCycle } from "@travel-crm/contracts/subscriptions";
import { addDays, parseCalendarDate, type CalendarDate } from "@travel-crm/domain/kernel";

const monthsOf: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** `start` (yyyy-mm-dd) moved forward whole months, its day held back to the last of a shorter month. */
function addMonths(start: CalendarDate, months: number): CalendarDate {
  const [year = 0, month = 1, day = 1] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return parseCalendarDate(target.toISOString().slice(0, 10));
}

/** The last day the cycle pays for: a month from 1 Nov is paid through 30 Nov. */
export function defaultPaidThrough(
  cycle: BillingCycle,
  paidOn: string,
  alreadyPaidThrough: string | null,
): CalendarDate {
  const paid = alreadyPaidThrough === null ? null : parseCalendarDate(alreadyPaidThrough);
  const day = parseCalendarDate(paidOn);
  const startsOn = paid !== null && paid >= day ? addDays(paid, 1) : day;
  return addDays(addMonths(startsOn, monthsOf[cycle]), -1);
}
