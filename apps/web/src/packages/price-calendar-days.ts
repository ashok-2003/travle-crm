// The price calendar's pure parts: the season a day falls in, and what each day of the calendar holds.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import type { PackageSeasonView } from "@travel-crm/contracts/quotes";

/** A calendar day, yyyy-mm-dd. */
export type CalendarDate = string;

/** What a day holds: the departure that starts on it, and the index of the season it falls in. */
export interface CalendarDay {
  departure: DepartureSummary | null;
  seasonIndex: number | null;
}

/** The season a day falls in, or none. */
export function seasonOn(seasons: readonly PackageSeasonView[], day: CalendarDate): PackageSeasonView | null {
  return seasons.find((season) => season.startsOn <= day && day <= season.endsOn) ?? null;
}

/** The days that hold something: every day of every season, and every departure's first day. */
export function calendarDaysOf(
  seasons: readonly PackageSeasonView[],
  departures: readonly DepartureSummary[],
): Map<CalendarDate, CalendarDay> {
  const days = new Map<CalendarDate, CalendarDay>();
  seasons.forEach((season, seasonIndex) => {
    for (let day = new Date(`${season.startsOn}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
      const key = day.toISOString().slice(0, 10);
      if (key > season.endsOn) break;
      days.set(key, { departure: null, seasonIndex });
    }
  });
  for (const departure of departures) {
    days.set(departure.startDate, { departure, seasonIndex: days.get(departure.startDate)?.seasonIndex ?? null });
  }
  return days;
}
