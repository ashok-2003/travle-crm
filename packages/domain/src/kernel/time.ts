// Time (spec 9.6): instants are stored in UTC and shown, and days counted, in the organization's time zone.
// Departure dates are calendar dates, days with no time at all.
import { isCalendarDate, isValidTimeZone } from "@travel-crm/contracts/kernel";

/** A day written YYYY-MM-DD, checked to be real. Build one with parseCalendarDate or calendarDateIn. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

export function parseCalendarDate(text: string): CalendarDate {
  if (!isCalendarDate(text))
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${JSON.stringify(text.slice(0, 30))}`);
  return text as CalendarDate;
}

function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Not an IANA time zone name: ${JSON.stringify(timeZone)}`);
}

// Formatters are slow to build and safe to share: keep one per zone and style.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock on the wall in timeZone shows at instant. */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatter(`parts|${timeZone}`, "en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

/** The day it is in timeZone at instant: at 18:30 UTC it is already tomorrow in India. */
export function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
  assertTimeZone(timeZone);
  const { year, month, day } = wallClock(instant, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as CalendarDate;
}

/** The year in timeZone at instant, e.g. for numbering documents by the organization's year. */
export function yearIn(instant: Date, timeZone: string): number {
  assertTimeZone(timeZone);
  return wallClock(instant, timeZone).year;
}

/** How far timeZone's clocks are ahead of UTC at an instant, in milliseconds. */
function offsetAt(instantMs: number, timeZone: string): number {
  const clock = wallClock(new Date(instantMs), timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - instantMs;
}

/**
 * The first instant of a day in timeZone. Usually midnight; where daylight saving skips midnight (Cuba in March),
 * the moment the clocks jump to.
 */
export function startOfDayIn(date: CalendarDate, timeZone: string): Date {
  assertTimeZone(timeZone);
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Guess with the offset at UTC midnight, then correct once with the offset at the guess: offsets change at most
  // once in a day.
  const first = midnightAsUtc - offsetAt(midnightAsUtc, timeZone);
  const second = midnightAsUtc - offsetAt(first, timeZone);
  const onTheDay = [first, second].filter((candidate) => calendarDateIn(new Date(candidate), timeZone) === date);
  return new Date(onTheDay.length > 0 ? Math.min(...onTheDay) : Math.max(first, second));
}

const styles: Record<"date" | "time" | "date-time", Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit", hour12: true },
  "date-time": { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
};

/** "15 Oct 2026", "9:30 pm" or "15 Oct 2026, 9:30 pm", in Indian English, as clocks in timeZone show it. */
export function formatDateTime(
  instant: Date,
  options: { timeZone: string; style: "date" | "time" | "date-time" },
): string {
  assertTimeZone(options.timeZone);
  return formatter(`${options.style}|${options.timeZone}`, "en-IN", {
    timeZone: options.timeZone,
    ...styles[options.style],
  }).format(instant);
}
