// G1's grounded set (spec 5): every amount the agency's data, this turn's quotes and the team stand behind; and the
// reader that finds amounts in words ("₹9,499", "12k", "1.2 lakh", "8 hazaar"), Devanagari digits read as digits.
import { amountsAndDatesIn, type AgencyAnswers, type ToldTotal } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { paiseFromSpoken } from "../../fill/money.js";
import type { QuoteFigures, TripSheet } from "../types.js";

export interface GroundedSet {
  /** Whether the data holds the amount: exactly, or within 1% when it was written as shorthand ("9.5k"). */
  has(paise: number, shorthand: boolean): boolean;
}

/** An amount of money in words, where it is, and whether it was written rounded ("12k", "8 hazaar"). */
export interface Amount {
  start: number;
  end: number;
  paise: number;
  shorthand: boolean;
}

const MONTH_MS = 30 * 86_400_000;
/** A per-person figure times 2 to 10 is a group's, so "₹9,499 × 3 = ₹28,497" needs no tool call. */
const MOST_PEOPLE = 10;
/** Below ₹100 a bare number in a Team line is a count or a day, never a price. */
const LEAST_BARE_PAISE = 10_000;
const DEVANAGARI_ZERO = 0x0966;

/** "₹९,४९९" reads "₹9,499": each Devanagari digit becomes its ASCII digit, one character for one, so spans hold. */
export const withAsciiDigits = (text: string): string =>
  text.replace(/[\u0966-\u096F]/gu, (digit) => String(digit.charCodeAt(0) - DEVANAGARI_ZERO));

/** "8 hazaar", "8 thousand", "8 हज़ार" (pre-flight #15), but not a height or a distance ("12 thousand feet"). */
const THOUSANDS =
  /(?<![\d.,])(\d+(?:\.\d+)?)\s*(?:hazaa?r|hajaa?r|thousand|ह(?:ज\u093C?|\u095B)ार)(?![\p{L}\p{M}])(?!\s*(?:ft|feet|m|metres?|meters?|kms?|kilometres?|kilometers?)\b)/giu;
const SHORTHAND = /\d\s*(?:k|l|lakhs?|lacs?|crores?|cr)(?![\p{L}])/iu;
const BARE_NUMBER = /(?<![\d.,])\d{1,3}(?:,\d{2,3})+(?![\d,])|(?<![\d.,])\d{3,}(?![\d,])/gu;

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

/** Every amount of money in the words, in order: what the reply check reads as money, and thousands in words. */
export function amountsIn(text: string): Amount[] {
  const digits = withAsciiDigits(text);
  const thousands = [...digits.matchAll(THOUSANDS)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    paise: Math.round(Number(m[1]) * 100_000),
    shorthand: true,
  }));
  const written = amountsAndDatesIn(digits).flatMap((span) => {
    if (span.kind !== "money" || thousands.some((one) => overlaps(one, span))) return [];
    const words = digits.slice(span.start, span.end);
    const paise = paiseFromSpoken(words.replace("/-", "").replace(/crores/giu, "crore"));
    return paise === null ? [] : [{ start: span.start, end: span.end, paise, shorthand: SHORTHAND.test(words) }];
  });
  return [...thousands, ...written].sort((a, b) => a.start - b.start);
}

/** As `amountsIn`, plus each bare number of ₹100 or more: a Team line or owner text says "8500 me de do". */
export function looseAmountsIn(text: string): Amount[] {
  const amounts = amountsIn(text);
  const bare = [...withAsciiDigits(text).matchAll(BARE_NUMBER)].flatMap((m) => {
    const span = { start: m.index, end: m.index + m[0].length };
    const paise = Number(m[0].replaceAll(",", "")) * 100;
    return amounts.some((one) => overlaps(one, span)) || paise < LEAST_BARE_PAISE
      ? []
      : [{ ...span, paise, shorthand: false }];
  });
  return [...amounts, ...bare];
}

export function groundedSetOf(amounts: Iterable<number>): GroundedSet {
  const exact = new Set(amounts);
  return {
    has: (paise, shorthand) =>
      exact.has(paise) || (shorthand && [...exact].some((one) => Math.abs(one - paise) * 100 <= one)),
  };
}

/** The trip's customer-facing owner text, for the amounts and dates it names. */
export function tripTextOf(sheet: TripSheet): string {
  return [
    sheet.summary,
    ...sheet.highlights,
    ...sheet.days.flatMap((one) => [one.title, one.text]),
    ...sheet.pickups,
    sheet.inclusions,
    sheet.exclusions,
    sheet.notes,
    sheet.cancellation,
  ].join("\n");
}

/** A table price, and when prices exclude GST, with GST added: exact, and to the rupee as a person would write it. */
function withGst(paise: number, sheet: TripSheet): number[] {
  if (sheet.pricesIncludeGst || sheet.taxRateBasisPoints === 0) return [paise];
  const taxed = paise + Math.round((paise * sheet.taxRateBasisPoints) / 10_000);
  return [paise, taxed, Math.round(taxed / 100) * 100];
}

const timesUpToTen = (paise: number) => Array.from({ length: MOST_PEOPLE }, (_, index) => paise * (index + 1));

function sheetAmounts(sheet: TripSheet, today: CalendarDate): number[] {
  const prices = [
    ...sheet.seasons.filter((season) => season.until >= today).map((season) => season.perPersonPaise),
    ...sheet.departures.map((one) => one.perPersonPaise),
  ].flatMap((byRoom) => Object.values(byRoom));
  const perPerson = [
    ...[...prices, ...(sheet.fromPaise === null ? [] : [sheet.fromPaise])].flatMap((paise) => withGst(paise, sheet)),
    ...(sheet.advancePerPersonPaise === null ? [] : [sheet.advancePerPersonPaise]),
  ];
  return [...perPerson.flatMap(timesUpToTen), ...amountsIn(tripTextOf(sheet)).map((one) => one.paise)];
}

/**
 * The amounts G1 lets through this turn (spec 5): table prices of seasons not ended and each departure's own, per room
 * and with GST when prices exclude it, the from-prices and advances, each times 2 to 10; this turn's quote figures (a
 * date past the sheet's 8 has its own price); totals told in the last 30 days; amounts in the agency's answers, trip
 * text and Team lines (the caller passes those of the last 30 days). Not the customer's amounts, nor earlier assistants'.
 */
export function groundedAmounts(input: {
  sheets: readonly TripSheet[];
  today: CalendarDate;
  answers: AgencyAnswers;
  teamLines: readonly string[];
  told: readonly ToldTotal[];
  quoted: readonly QuoteFigures[];
  now: Date;
}): GroundedSet {
  const quoted = input.quoted.flatMap((one) => [
    ...timesUpToTen(one.perPersonPaise),
    ...timesUpToTen(one.advancePerPersonPaise),
    one.totalPaise,
    one.advancePaise,
  ]);
  const told = input.told
    .filter((one) => input.now.getTime() - Date.parse(one.at) <= MONTH_MS)
    .map((one) => one.totalPaise);
  const written = [
    ...Object.values(input.answers).flatMap((answer) => amountsIn(answer)),
    ...input.teamLines.flatMap((line) => looseAmountsIn(line)),
  ].map((one) => one.paise);
  return groundedSetOf([
    ...input.sheets.flatMap((sheet) => sheetAmounts(sheet, input.today)),
    ...quoted,
    ...told,
    ...written,
  ]);
}
