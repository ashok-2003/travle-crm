// The departures calendar's pure parts: months and their day ranges, the season column a day falls in, the price a day
// shows, and a long repeat cut into the pieces the api takes.
import { MAX_ADDED_DATES } from "@travel-crm/contracts/departures";
import { formatCalendarDay, formatWeekday } from "@/lib/format";
import {
  adultRoomTypes,
  OPEN_SEASON_END,
  roomTypes,
  type RoomPrices,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";

/** A departure with this many seats free, or fewer, is nearly full: the calendar says so in bold. */
export const FEW_SEATS = 5;

/** A calendar day, yyyy-mm-dd. */
export type Day = string;
/** A month, yyyy-mm. */
export type Month = string;

const two = (part: number) => String(part).padStart(2, "0");
const DAY_MS = 86_400_000;
const utc = (day: Day) => Date.parse(`${day}T00:00:00Z`);
const fromUtc = (ms: number): Day => new Date(ms).toISOString().slice(0, 10);

/** The day a date falls on where the browser is. */
export const dayKeyOf = (date: Date): Day =>
  `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
/** The browser's local midnight of a day, as the calendar holds days. */
export const dateOf = (day: Day): Date =>
  new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8)));

export const monthOf = (day: Day): Month => day.slice(0, 7);
export const addDays = (day: Day, days: number): Day => fromUtc(utc(day) + days * DAY_MS);
/** 0 Sunday to 6 Saturday, the numbering the trip's weekly days use. */
export const weekdayOf = (day: Day): number => new Date(utc(day)).getUTCDay();

/** The first and last day of a month. */
export function monthRange(month: Month): { from: Day; to: Day } {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  return { from: `${month}-01`, to: `${month}-${two(new Date(Date.UTC(year, number, 0)).getUTCDate())}` };
}

export function shiftMonth(month: Month, by: number): Month {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + by;
  return `${String(Math.floor(index / 12))}-${two((index % 12) + 1)}`;
}

/** The index of the season column whose range covers the day, or null. */
export function columnIndexOn(columns: readonly SeasonColumn[], day: Day): number | null {
  const index = columns.findIndex((column) =>
    column.ranges.some((range) => range.startsOn <= day && day <= range.endsOn),
  );
  return index === -1 ? null : index;
}

/** What a season column's range says: "20 Nov to 22 Nov" is built by the caller; a range with no end is open. */
export const isOpenEnd = (endsOn: Day): boolean => endsOn === OPEN_SEASON_END;

/** The lowest price per person of a departure's rooms (an adult's room, else any), or null when none is priced. */
export function lowestPrice(prices: RoomPrices): number | null {
  const of = (types: readonly (typeof roomTypes)[number][]) =>
    types.flatMap((type) => (prices[type] === null ? [] : [prices[type]]));
  const adults = of(adultRoomTypes);
  const found = adults.length > 0 ? adults : of(roomTypes);
  return found.length === 0 ? null : Math.min(...found);
}

/** A repeat from `from` to `to` cut into pieces of at most the api's days per call. */
export function repeatPieces(from: Day, to: Day): { from: Day; to: Day }[] {
  const pieces: { from: Day; to: Day }[] = [];
  for (let start = from; start <= to; start = addDays(start, MAX_ADDED_DATES)) {
    const end = addDays(start, MAX_ADDED_DATES - 1);
    pieces.push({ from: start, to: end < to ? end : to });
  }
  return pieces;
}

/** Months in the order a person reads them: starting after the longest gap, so November, December, January. */
export function monthsInReadingOrder(months: readonly number[]): number[] {
  const sorted = [...months].sort((a, b) => a - b);
  if (sorted.length < 2) return sorted;
  let startAt = 0;
  let widest = -1;
  sorted.forEach((month, index) => {
    const before = sorted[(index + sorted.length - 1) % sorted.length] ?? month;
    const gap = (month - before + 12) % 12;
    if (gap > widest) {
      widest = gap;
      startAt = index;
    }
  });
  return [...sorted.slice(startAt), ...sorted.slice(0, startAt)];
}

/** "Fri 4 Dec": a day with its weekday, as the calendar's panel and list name it. */
export const dayWithWeekday = (day: Day): string =>
  `${formatWeekday(new Date(`${day}T00:00:00Z`), { timeZone: "UTC" })} ${formatCalendarDay(day)}`;
