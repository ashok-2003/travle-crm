// A dashboard period's days, in the agency's zone: the last 7, 30 or 90 days with today, or this calendar month so far.
import type { DashboardRange } from "@travel-crm/contracts/insights";
import { addDays, parseCalendarDate, type CalendarDate } from "../kernel/index.js";

const DAYS: Record<Exclude<DashboardRange, "month">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function periodDays(range: DashboardRange, today: CalendarDate): { first: CalendarDate; last: CalendarDate } {
  const first = range === "month" ? parseCalendarDate(`${today.slice(0, 8)}01`) : addDays(today, 1 - DAYS[range]);
  return { first, last: today };
}

/** Every day from first to last, in order. */
export function daysOf({ first, last }: { first: CalendarDate; last: CalendarDate }): CalendarDate[] {
  const days: CalendarDate[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}
