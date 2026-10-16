// Time (spec 9.6): instants are stored in UTC and shown, and days counted, in the organization's time zone.
// Departure dates are calendar dates, days with no time at all.
import { isCalendarDate, isTimeOfDay, isValidTimeZone } from "@travel-crm/contracts/kernel";

/** A day written YYYY-MM-DD, checked to be real. Build one with parseCalendarDate or calendarDateIn. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

export function parseCalendarDate(text: string): CalendarDate {
  if (!isCalendarDate(text))
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${JSON.stringify(text.slice(0, 30))}`);
  return text as CalendarDate;
}

/** A time of day on a clock, 24-hour HH:MM, checked. Build one with parseTimeOfDay or timeOfDayIn. */
export type TimeOfDay = string & { readonly __brand: "TimeOfDay" };

export function parseTimeOfDay(text: string): TimeOfDay {
  if (!isTimeOfDay(text)) throw new RangeError(`Not a time of day (HH:MM): ${JSON.stringify(text.slice(0, 30))}`);
  return text as TimeOfDay;
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

/** What a clock on the wall in timeZone shows at instant. An invalid Date makes Intl throw a RangeError. */
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

/** The calendar date `days` days after date (before it, for a negative number). Days have no time zone. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  if (!Number.isSafeInteger(days)) throw new RangeError(`Days to add must be a whole number, got ${String(days)}`);
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10) as CalendarDate;
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
 * the moment the clocks jump to. A day that never happened (30 December 2011 in Samoa) starts when the next day
 * that did, 31 December, starts. Where midnight happens twice, it is the first.
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** The wall clock at an instant, to the minute, as milliseconds of the same reading in UTC. */
function wallClockMinute(instantMs: number, timeZone: string): number {
  const clock = wallClock(new Date(instantMs), timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
}

/**
 * The instant clocks in timeZone show `time` on `day`: "tomorrow at 09:00" in the agency's zone. Where clocks go
 * back and the time happens twice, the first; where they jump forward over it, the first instant after the jump
 * (02:30 on a night New York skips 02:00-03:00 is 03:00). Offsets change at most once within a day either side.
 */
export function instantAt(day: CalendarDate, time: TimeOfDay, timeZone: string): Date {
  assertTimeZone(timeZone);
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // The offsets in force a day before and a day after the reading: the only two this time can have.
  const before = wall - offsetAt(wall - DAY_MS, timeZone);
  const after = wall - offsetAt(wall + DAY_MS, timeZone);
  const shown = [before, after].filter((candidate) => wallClockMinute(candidate, timeZone) === wall);
  if (shown.length > 0) return new Date(Math.min(...shown));
  return new Date(firstInstantAfterJump(Math.min(before, after), Math.max(before, after), timeZone));
}

/** The instant the offset changes between `earlier` (old offset) and `later` (new offset), to the second. */
function firstInstantAfterJump(earlier: number, later: number, timeZone: string): number {
  const newOffset = offsetAt(later, timeZone);
  let [low, high] = [earlier, later];
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2000) * 1000;
    if (offsetAt(middle, timeZone) === newOffset) high = middle;
    else low = middle;
  }
  return high;
}

/** What a clock in timeZone shows at instant, HH:MM: the time a due date reads on the agency's clock. */
export function timeOfDayIn(instant: Date, timeZone: string): TimeOfDay {
  assertTimeZone(timeZone);
  const { hour, minute } = wallClock(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` as TimeOfDay;
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
