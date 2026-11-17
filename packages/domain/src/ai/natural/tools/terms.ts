// A booking's terms as the natural agent's offer and book tools name them: read from the call's arguments, compared with
// the live offer or a total told, and said in words for a result or a refusal.
import { offerBookingArguments, parseToolArguments, type BookingTerms } from "@travel-crm/contracts/ai";
import { formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { travellerWords } from "../../lite/context/lead-card.js";
import { sameAges } from "../../lite/typed-lock.js";
import { isText, roomNames } from "../trips/trip-text.js";
import type { TripSheet } from "../types.js";
import type { Refused } from "./quote.js";

/** The arguments that name the terms; `book` adds the full name and the customer's words. */
const TERM_ARGUMENTS = ["trip_id", "date", "adults", "children_ages", "room", "pay_in_full"] as const;

/** The terms a call names, or what is wrong with them as a refusal. */
export function termsOf(args: Record<string, unknown>, labels: ReadonlyMap<string, string>): BookingTerms | Refused {
  const named = Object.fromEntries(
    TERM_ARGUMENTS.filter((key) => Object.hasOwn(args, key)).map((key) => [key, args[key]]),
  );
  const checked = parseToolArguments("offer_booking", named, [...labels.keys()]);
  if (!checked.ok) return { refused: `refused: ${checked.problem}` };
  const parsed = offerBookingArguments.safeParse(checked.args);
  const packageId = parsed.success ? labels.get(parsed.data.trip_id) : undefined;
  if (!parsed.success || packageId === undefined) return { refused: "refused: the arguments weren't understood" };
  const asked = parsed.data;
  return {
    packageId,
    startsOn: asked.date,
    adults: asked.adults,
    childrenAges: asked.children_ages,
    room: asked.room ?? null,
    payInFull: asked.pay_in_full ?? false,
  };
}

/** Whether a total told was for these terms (pre-flight #20): paying in full changes no total, so it isn't compared. */
export function toldMatches(terms: BookingTerms, told: Omit<BookingTerms, "payInFull">): boolean {
  return (
    terms.packageId === told.packageId &&
    terms.startsOn === told.startsOn &&
    terms.adults === told.adults &&
    terms.room === told.room &&
    sameAges(terms.childrenAges, told.childrenAges)
  );
}

/** Whether two terms are one booking: the same trip, day, party (ages in any order), room and paying in full or not. */
export function sameTerms(a: BookingTerms, b: BookingTerms): boolean {
  return toldMatches(a, b) && a.payInFull === b.payInFull;
}

/** "T1 Kedarkantha Trek, Sat 19 Dec, 2 adults, double", and "paying in full" when they are. */
export function termsWords(terms: BookingTerms, sheets: readonly TripSheet[], today: CalendarDate): string {
  const sheet = sheets.find((one) => one.packageId === terms.packageId);
  return [
    sheet === undefined ? "a trip not on sale now" : `${sheet.label} ${fenced(sheet.title)}`,
    formatShortDay(parseCalendarDate(terms.startsOn), today),
    travellerWords(terms.adults, terms.childrenAges),
    terms.room === null ? null : roomNames[terms.room],
    terms.payInFull ? "paying in full" : null,
  ]
    .filter(isText)
    .join(", ");
}
