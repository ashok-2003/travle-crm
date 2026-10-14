// Calendar dates and time zone names as the API takes them (spec 9.6). Times themselves cross the API as ISO
// instants in UTC; an organization's zone says how to show them.
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

/** An organization's time zone, e.g. "Asia/Kolkata". */
export const timeZoneName = z.string().trim().max(64).refine(isValidTimeZone, "Use a time zone like Asia/Kolkata");
