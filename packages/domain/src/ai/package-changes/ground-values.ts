// What grounding shares: a change being built (its fields and its flags), and the checks that a price, a number or another
// trip's nights are printed in the lines the AI cites.
import type { PackageChange, packageChangeFlags } from "@travel-crm/contracts/ai";
import { MAX_QUOTE_PAISE, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { CalendarDate } from "../../kernel/index.js";
import { amountInLine, numbersIn, parsePrintedPrice } from "../rates/price.js";
import type { TripSnapshot } from "./trip-snapshot.js";

export type ChangeFlag = (typeof packageChangeFlags)[number];

/** A change's own fields, before its id, evidence and the flags every change gets. */
export interface Built {
  body: { kind: PackageChange["kind"] } & Record<string, unknown>;
  flags: ChangeFlag[];
}

/** What a builder reads: the trip, today, and the texts of the lines the change cites. */
export interface Grounding {
  snapshot: TripSnapshot;
  today: CalendarDate;
  texts: readonly string[];
}

export const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};

/**
 * Room prices over `base`: each printed price as paise, null where the AI says a room isn't sold, rooms the trip doesn't
 * sell left out. Grounded only when every price is one amount printed in a cited line.
 */
export function pricesFrom(
  printed: readonly { room: RoomType; printed: string | null }[],
  base: RoomPrices,
  sold: readonly RoomType[],
  texts: readonly string[],
): { prices: RoomPrices; grounded: boolean } {
  const prices = { ...base };
  let grounded = true;
  for (const one of printed) {
    if (sold.length > 0 && !sold.includes(one.room)) continue;
    if (one.printed === null) {
      prices[one.room] = null;
      continue;
    }
    const paise = parsePrintedPrice(one.printed);
    if (paise === null || paise > MAX_QUOTE_PAISE) {
      grounded = false;
      continue;
    }
    if (!texts.some((text) => amountInLine(paise, text))) grounded = false;
    prices[one.room] = paise;
  }
  return { prices, grounded };
}

export const samePrices = (first: RoomPrices, second: RoomPrices) =>
  (Object.keys(first) as RoomType[]).every((type) => first[type] === second[type]);

export const hasPrice = (prices: RoomPrices) => Object.values(prices).some((price) => price !== null);

/** Whether a cited line prints this number as it is ("30" seats). */
export const numberInTexts = (number: number, texts: readonly string[]) =>
  texts.some((text) => numbersIn(text).has(String(number)));

/** Whether every number the new text adds (one the old text lacks) is printed in a cited line. */
export function numbersBacked(value: string, before: string, texts: readonly string[]): boolean {
  const had = numbersIn(before);
  return [...numbersIn(value)].every((number) => had.has(number) || texts.some((text) => numbersIn(text).has(number)));
}

/** "4N/5D", "4N5D", "4 nights 5 days": the nights a text names. */
const NIGHTS_AND_DAYS = /(\d{1,2})\s*(?:n|nights?)\s*[/&,-]?\s*(\d{1,2})\s*(?:d|days?)\b/gi;

/** Whether a cited line names a trip of other nights (the 5N/6D prices are never the 4N/5D trip's). */
export function namesOtherTrip(texts: readonly string[], nights: number | null): boolean {
  if (nights === null) return false;
  return texts.some((text) => [...text.matchAll(NIGHTS_AND_DAYS)].some((match) => Number(match[1]) !== nights));
}

/** A label as a season takes one: trimmed, at most 60 characters. */
export const labelOf = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 60).trim();
