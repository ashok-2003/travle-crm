// The price calendar's pure parts: a date's day, and the departure each day holds.
import type { DepartureSummary } from "@travel-crm/contracts/departures";

/** A calendar day, yyyy-mm-dd. */
export type CalendarDate = string;

const two = (part: number) => String(part).padStart(2, "0");
/** The day a date falls on where the browser is (the calendar's days, and today). */
export const dayKeyOf = (date: Date): CalendarDate =>
  `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;

/** The departure that starts on each day (one per day: a later one in the list wins). */
export const departuresByDay = (departures: readonly DepartureSummary[]): Map<CalendarDate, DepartureSummary> =>
  new Map(departures.map((departure) => [departure.startDate, departure]));
