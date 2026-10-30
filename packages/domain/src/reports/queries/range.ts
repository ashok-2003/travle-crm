// The named ranges a question may use ("last month", "this quarter"), turned into days in the agency's zone by code: the AI
// only says which name, never a date.
import type { AskRange } from "@travel-crm/contracts/reports";
import { addDays, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { periodDays } from "../../insights/index.js";

export const DEFAULT_ASK_RANGE: AskRange = "30d";

const firstOf = (year: number, month: number) =>
  parseCalendarDate(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10));

/** The first and last day of the range, ending today for the "so far" ones. */
export function daysOfRange(range: AskRange, today: CalendarDate): { first: CalendarDate; last: CalendarDate } {
  if (range === "7d" || range === "30d" || range === "90d" || range === "month") return periodDays(range, today);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  if (range === "last_month") {
    return { first: firstOf(year, month - 1), last: addDays(firstOf(year, month), -1) };
  }
  const quarterStart = month - (month % 3);
  if (range === "quarter") return { first: firstOf(year, quarterStart), last: today };
  return { first: firstOf(year, quarterStart - 3), last: addDays(firstOf(year, quarterStart), -1) };
}
