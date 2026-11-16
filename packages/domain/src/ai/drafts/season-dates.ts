// A season named by its months ("Dec–Jan") as real dates: the next time it is on, in the agency's calendar.
import { addDays, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";

const pad = (number: number) => String(number).padStart(2, "0");

/** The last day of a month: the day before the first of the next. */
function lastDayOf(year: number, month: number): CalendarDate {
  const next = month === 12 ? `${String(year + 1)}-01-01` : `${String(year)}-${pad(month + 1)}-01`;
  return addDays(parseCalendarDate(next), -1);
}

/**
 * The first run of these months that is not over yet: this year's if it still has days to come, else next year's. A run that
 * wraps the new year (Dec–Jan) starts in the year before it ends, so one already inside January is the one that began last December.
 */
export function seasonDates(
  months: { from: number; to: number },
  today: CalendarDate,
): { startsOn: CalendarDate; endsOn: CalendarDate } {
  const thisYear = Number(today.slice(0, 4));
  const wraps = months.to < months.from;
  for (let year = thisYear - 1; year <= thisYear + 1; year++) {
    const endsOn = lastDayOf(year + (wraps ? 1 : 0), months.to);
    if (endsOn >= today) return { startsOn: parseCalendarDate(`${String(year)}-${pad(months.from)}-01`), endsOn };
  }
  throw new RangeError("No season found");
}
