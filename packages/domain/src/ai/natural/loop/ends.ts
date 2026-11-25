// How a turn's staged actions are kept at its end (spec 3.2 and 3.6): the customer-facing ones, the set without some
// tools, and what wasn't done for the team's task.
import type { BookingTerms } from "@travel-crm/contracts/ai";
import { formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import type { StagedAction, StagedSet } from "../types.js";

/**
 * What reaches the customer, never in a fallback (the lead's ruling, 2026-11-16): no seats held, no payment lines or QR,
 * no brochure, no offer they didn't read, and no stay_quiet, since the team's task stands for the reply. The agency's own
 * actions stay: a task, a hand-over, the lead's fields, a note, a follow-up, a suggested close.
 */
export const CUSTOMER_FACING = ["book", "resend_payment", "send_brochure", "offer_booking", "stay_quiet"] as const;

export function without(set: StagedSet, tools: readonly StagedAction["tool"][]): StagedSet {
  return new Map([...set].filter(([tool]) => !tools.includes(tool)));
}

/** A dropped action in the team's words, so they can do it themselves; null when there is nothing to do. */
export function notDone(
  action: StagedAction,
  tripOf: (packageId: string) => string,
  today: CalendarDate,
): string | null {
  const trip = (terms: Omit<BookingTerms, "payInFull">) =>
    `${tripOf(terms.packageId)} for ${String(terms.adults + terms.childrenAges.length)} on ` +
    formatShortDay(parseCalendarDate(terms.startsOn), today);
  switch (action.tool) {
    case "book":
      return `the customer may have wanted to book ${trip(action.terms)}`;
    case "offer_booking":
      return `the AI meant to offer ${trip(action.offer)}, total ${formatRupees(action.offer.totalPaise)}`;
    case "send_brochure":
      return `the AI meant to send ${tripOf(action.packageId)}'s brochure`;
    case "resend_payment":
      return "the AI meant to send the payment details again";
    default:
      return null;
  }
}
