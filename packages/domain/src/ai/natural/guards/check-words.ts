// The natural agent's guards' shapes, which guardReads still builds (spec 5, G1–G5), and the trace's flags on a reply's
// words, which check nothing.
import { OPEN_SEASON_END } from "@travel-crm/contracts/quotes";
import type { LiveOffer, NaturalTrace } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { sentencesOf } from "../../lite/phrase-match.js";
import { namedTrips } from "../context/turn-block.js";
import type { TripSheet } from "../types.js";
import { withAsciiDigits } from "./amounts.js";
import { datesIn } from "./dates.js";
import { tripTextOf, type GroundedSet } from "./grounded.js";

export type GuardName = "G1" | "G2" | "G3" | "G4" | "G5";
export type GuardFallback = "fallback_task" | "withdraw_offer" | "hand_over_discount";
export type WordsVerdict =
  | { ok: true; verdicts: NaturalTrace["guards"] }
  | { ok: false; guard: GuardName; retry: string; fallback: GuardFallback; verdicts: NaturalTrace["guards"] };

export interface GuardContext {
  grounded: GroundedSet;
  /** The customer's lines: an amount from them is theirs, never the agency's. */
  customerText: string;
  /** The offer staged this turn, if any (G2). */
  offer: LiveOffer | null;
  paymentConfirmed: boolean;
  bookingConfirmed: boolean;
  /** Team lines of the last 30 days. */
  teamText: string;
  ownerText: string;
  today: CalendarDate;
}

const SEATS = /(?<![\d.,])(\d{1,3})\s*(?:seats?|सीटें|सीट)(?![\p{L}\p{M}])/giu;

/**
 * Not checks (spec 5): codes for the trace. A date found in no departure, season, owner text or customer line
 * ("date_not_in_data:2026-12-13"), and a seat count no departure of the trip holds on the sentence's dates
 * ("seats_differ:T1"; every trip when the sentence names none).
 */
export function traceFlags(
  words: string,
  context: { sheets: readonly TripSheet[]; ownerText: string; customerText: string; today: CalendarDate },
): string[] {
  const { sheets, today } = context;
  const known = new Set<string>([
    ...sheets.flatMap((sheet) => [
      ...sheet.departures.map((one) => one.startsOn),
      // A season with no end has no last day to name.
      ...sheet.seasons.flatMap((season) =>
        season.until === OPEN_SEASON_END ? [season.from] : [season.from, season.until],
      ),
    ]),
    ...[context.ownerText, context.customerText, ...sheets.map(tripTextOf)].flatMap((text) => datesIn(text, today)),
  ]);
  const flags = datesIn(words, today)
    .filter((one) => !known.has(one))
    .map((one) => `date_not_in_data:${one}`);
  for (const sentence of sentencesOf(withAsciiDigits(words))) {
    const named = namedTrips(sheets, sentence.text);
    const trips = named.length === 0 ? sheets : sheets.filter((sheet) => named.includes(sheet.packageId));
    const days = datesIn(sentence.text, today);
    for (const m of sentence.text.matchAll(SEATS)) {
      for (const trip of trips) {
        const departures = trip.departures.filter((one) => days.length === 0 || days.includes(one.startsOn));
        if (!departures.some((one) => one.freeSeats === Number(m[1]))) flags.push(`seats_differ:${trip.label}`);
      }
    }
  }
  return [...new Set(flags)];
}
