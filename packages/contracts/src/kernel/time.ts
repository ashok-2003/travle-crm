// Calendar dates, wall-clock times and time zone names as the API takes them (spec 9.6). Instants cross the API as ISO
// times in UTC; an organization's zone says how to show them. A time someone picks ("16 Oct, 4:00 pm") travels as a day
// and a time on the agency's clock, and the server turns it into an instant in the agency's zone (R25).
import { z } from "zod";

/** "Area/Location" with as many parts as IANA uses, or UTC. Offsets (+05:30) and abbreviations (IST, EST) are refused. */
const ZONE_NAME_PATTERN = /^(?:UTC|[A-Z][A-Za-z]*(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*)+)$/;

/** True for an IANA time zone name the runtime knows, such as "Asia/Kolkata". */
export function isValidTimeZone(name: string): boolean {
  if (!ZONE_NAME_PATTERN.test(name)) return false;
  try {
    // Intl throws a RangeError for a zone it doesn't know.
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real day written YYYY-MM-DD, from the year 1000 (2026-02-30 is refused). */
export function isCalendarDate(text: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A day with no time, such as a departure date: "2026-10-15". */
export const calendarDate = z.string().refine(isCalendarDate, "Use a date like 2026-10-15");

/**
 * An organization's time zone, e.g. "Asia/Kolkata", stored as entered. Intl ignores case, so "Asia/KOLKATA" is
 * accepted too; the web app's time zone picker (plan 5) supplies canonical IANA spellings from a curated list. Code
 * that compares two zones should compare the names Intl resolves them to, not the strings.
 */
export const timeZoneName = z.string().trim().max(64).refine(isValidTimeZone, "Use a time zone like Asia/Kolkata");

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a 24-hour time written HH:MM, such as "09:30" or "16:00". */
export function isTimeOfDay(text: string): boolean {
  return TIME_OF_DAY_PATTERN.test(text);
}

/** A time of day on a clock, 24-hour: "09:30". */
export const timeOfDay = z.string().regex(TIME_OF_DAY_PATTERN, "Use a time like 09:30");

/** A day and a time on the agency's clock, as someone picks a due time: { on: "2026-10-17", at: "16:00" }. */
export const wallClockTime = z.strictObject({ on: calendarDate, at: timeOfDay });
export type WallClockTime = z.infer<typeof wallClockTime>;
