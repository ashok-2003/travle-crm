// Calendar dates as the subscription tables store them: Postgres date columns, which Prisma reads as midnight UTC.
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, parseCalendarDate, type CalendarDate } from "../kernel/index.js";

/** The Date Prisma writes for a calendar date. */
export function toDateColumn(date: string): Date {
  return new Date(`${parseCalendarDate(date)}T00:00:00.000Z`);
}

/** The calendar date a date column holds. */
export function fromDateColumn(value: Date): CalendarDate {
  return parseCalendarDate(value.toISOString().slice(0, 10));
}

/** Today in the organization's time zone: dates are paid through, and trials end, in that zone (spec 9.1). */
export async function todayFor(tx: OrgTx, organizationId: string, now: Date): Promise<CalendarDate> {
  return calendarDateIn(now, await organizationTimeZone(tx, organizationId));
}
