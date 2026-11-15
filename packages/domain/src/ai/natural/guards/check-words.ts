// The guards on a reply's words (spec 5, G1–G5), claims first as lite's check runs them: each checks the words against
// the agency's data and never refuses a reply just for holding a number. Also the trace's flags, which check nothing.
import { amountsAndDatesIn, paymentDetailsIn, type LiveOffer, type NaturalTrace } from "@travel-crm/contracts/ai";
import { formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { monthOf, resolveDay } from "../../fill/dates.js";
import { sentencesOf } from "../../lite/phrase-match.js";
import { namedTrips } from "../context/turn-block.js";
import type { TripSheet } from "../types.js";
import { paymentClaimCheck, teamWordCheck, type GuardOutcome } from "./claims.js";
import { amountsIn, groundedSetOf, looseAmountsIn, tripTextOf, withAsciiDigits, type GroundedSet } from "./grounded.js";

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

/** What a guard's second failure does (spec 5): the fallback line and a task, the offer withdrawn, or a hand-over. */
const FALLBACK: Record<GuardName, GuardFallback> = {
  G1: "fallback_task",
  G2: "withdraw_offer",
  G3: "fallback_task",
  G4: "hand_over_discount",
  G5: "fallback_task",
};
const PAYMENT_DETAIL_RETRY =
  "Leave payment details out of your words: the app sends the agency's own (resend_payment sends them again).";

/** Hindi month names, NFC (a nukta stays a separate mark): सितंबर or सितम्बर, अक्टूबर or अक्तूबर. */
const HINDI_MONTHS = [
  "जनवरी",
  "फ\u093C?रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सित(?:ं|म्)बर",
  "अक्(?:टू|तू)बर",
  "नव(?:ं|म्)बर",
  "दिस(?:ं|म्)बर",
];
const HINDI_DATE = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${HINDI_MONTHS.join("|")})(?![\\p{L}\\p{M}])`, "gu");
const NUMERIC_DATE = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/u;
const DAY_MONTH = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]+)/giu;
const MONTH_DAY = /([a-z]+)\.?\s*(\d{1,2})(?!\d)/giu;
const SEATS = /(?<![\d.,])(\d{1,3})\s*(?:seats?|सीटें|सीट)(?![\p{L}\p{M}])/giu;

/** "13 Dec", "Dec 13th", "13/12" as day/month[/year], or null for a span with no day of a month ("this Saturday"). */
function dayOfMonth(span: string): string | null {
  const numeric = NUMERIC_DATE.exec(span);
  if (numeric) return [numeric[1], numeric[2], numeric[3]].filter((part) => part !== undefined).join("/");
  for (const m of span.matchAll(DAY_MONTH)) {
    const month = monthOf((m[2] ?? "").toLowerCase());
    if (month !== null) return `${m[1] ?? ""}/${String(month)}`;
  }
  for (const m of span.matchAll(MONTH_DAY)) {
    const month = monthOf((m[1] ?? "").toLowerCase());
    if (month !== null) return `${m[2] ?? ""}/${String(month)}`;
  }
  return null;
}

const hindiMonthOf = (name: string) =>
  HINDI_MONTHS.findIndex((pattern) => new RegExp(`^(?:${pattern})$`, "u").test(name)) + 1;

/** The days the text names with a day of a month, each the next one not past (a day with a past year: none). */
function datesIn(text: string, today: CalendarDate): CalendarDate[] {
  const digits = withAsciiDigits(text).normalize("NFC");
  const written = [
    ...amountsAndDatesIn(digits).flatMap((span) =>
      span.kind === "date" ? [dayOfMonth(digits.slice(span.start, span.end))] : [],
    ),
    ...[...digits.matchAll(HINDI_DATE)].map((m) => `${m[1] ?? ""}/${String(hindiMonthOf(m[2] ?? ""))}`),
  ];
  const days = written.flatMap((one) => (one === null ? [] : [resolveDay(one, today)]));
  return [...new Set(days.flatMap((one) => (one === null ? [] : [parseCalendarDate(one)])))];
}

/** G1: every amount is one the data holds; the customer's own figure gets its own retry. */
function amountCheck(words: string, { grounded, customerText }: GuardContext): GuardOutcome {
  const amounts = amountsIn(words);
  if (amounts.length === 0) return null;
  const detail = amounts.map((one) => formatRupees(one.paise)).join(", ");
  const invented = amounts.find((one) => !grounded.has(one.paise, one.shorthand));
  if (invented === undefined) return { passed: true, detail };
  const figure = formatRupees(invented.paise);
  const theirs = groundedSetOf(looseAmountsIn(customerText).map((one) => one.paise));
  const retry = theirs.has(invented.paise, invented.shorthand)
    ? `${figure} is the customer's own figure: refer to it without the amount.`
    : `${figure} isn't in the agency's prices. Use a price from the trips, call quote, or leave the amount out.`;
  return { passed: false, detail, retry };
}

/** G2: with an offer staged, the words state its day and month, and its advance (in all or each), or its total if paid in full. */
function offerCheck(words: string, { offer, today }: GuardContext): GuardOutcome {
  if (offer === null) return null;
  const perPerson = Math.round(offer.advancePaise / (offer.adults + offer.childrenAges.length));
  const due = groundedSetOf(offer.payInFull ? [offer.totalPaise] : [offer.advancePaise, perPerson]);
  const startsOn = parseCalendarDate(offer.startsOn);
  const date = `date (${formatShortDay(startsOn, today)})`;
  const money = offer.payInFull
    ? `total (${formatRupees(offer.totalPaise)})`
    : `advance (${formatRupees(offer.advancePaise)}, or ${formatRupees(perPerson)} per person)`;
  const missing = [
    datesIn(words, today).includes(startsOn) ? null : date,
    amountsIn(words).some((one) => due.has(one.paise, one.shorthand)) ? null : money,
  ].filter((part) => part !== null);
  if (missing.length === 0) return { passed: true, detail: `${date}; ${money}` };
  const retry = `Your words must state the offer's ${missing.join(" and ")}: the customer says yes to what they read.`;
  return { passed: false, detail: missing.join("; "), retry };
}

/** G5: a UPI handle, an account, an IFSC or a payment link only ever goes as code's own message (ruling 5). */
function paymentDetailCheck(words: string): GuardOutcome {
  const found = paymentDetailsIn(withAsciiDigits(words)).length;
  if (found === 0) return null;
  return {
    passed: false,
    detail: found === 1 ? "a payment detail" : `${String(found)} payment details`,
    retry: PAYMENT_DETAIL_RETRY,
  };
}

/** The guards in order (G3, G4, G5, G1, G2); each that meets its trigger is recorded, and the first failure stops. */
export function checkWords(words: string, context: GuardContext): WordsVerdict {
  const guards: [GuardName, () => GuardOutcome][] = [
    ["G3", () => paymentClaimCheck(words, context)],
    ["G4", () => teamWordCheck(words, context)],
    ["G5", () => paymentDetailCheck(words)],
    ["G1", () => amountCheck(words, context)],
    ["G2", () => offerCheck(words, context)],
  ];
  const verdicts: NaturalTrace["guards"] = [];
  for (const [guard, run] of guards) {
    const outcome = run();
    if (outcome === null) continue;
    verdicts.push({ guard, passed: outcome.passed, detail: outcome.detail });
    if (!outcome.passed) return { ok: false, guard, retry: outcome.retry, fallback: FALLBACK[guard], verdicts };
  }
  return { ok: true, verdicts };
}

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
      ...sheet.seasons.flatMap((season) => [season.from, season.until]),
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
