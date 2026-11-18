// Where a period starts, in the agency's time zone: today's midnight, Monday's, or the 1st's.
import type { Period } from "@travel-crm/contracts/kernel";
import { addDays, calendarDateIn, startOfDayIn, type CalendarDate } from "./time.js";

const MONDAY = 1;

/** The first instant of the period that `now` falls in; null for all time. */
export function periodStart(period: Period, now: Date, timeZone: string): Date | null {
  if (period === "all") return null;
  const today = calendarDateIn(now, timeZone);
  if (period === "today") return startOfDayIn(today, timeZone);
  if (period === "month") return startOfDayIn(`${today.slice(0, 8)}01` as CalendarDate, timeZone);
  // Days are zone-free, so the weekday of the calendar date is read in UTC.
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return startOfDayIn(addDays(today, -((weekday - MONDAY + 7) % 7)), timeZone);
}
