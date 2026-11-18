// The refusal's way on for a past day or month: the next one with the same day and month, so the model resends it
// instead of retrying a wrong year or asking the customer which year (live, 2026-11-18).
import { parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";

const real = (year: number, month: string, date: string): CalendarDate | null => {
  const candidate = `${String(year)}-${month}-${date}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== Number(date) ? null : parseCalendarDate(candidate);
};

/** The day's next with its day and month, on or after today: this year's, else next year's; null for a 29 Feb with none. */
export function nextDay(past: string, today: CalendarDate): CalendarDate | null {
  const [, month = "", date = ""] = past.split("-");
  const year = Number(today.slice(0, 4));
  const thisYear = real(year, month, date);
  if (thisYear !== null && thisYear >= today) return thisYear;
  return real(year + 1, month, date);
}

/** The month's next (yyyy-mm): this year's if it hasn't passed, else next year's. */
export function nextMonth(past: string, today: CalendarDate): string {
  const month = past.slice(5, 7);
  const year = Number(today.slice(0, 4));
  return `${String(`${String(year)}-${month}` >= today.slice(0, 7) ? year : year + 1)}-${month}`;
}
