// A season column's dates in words, for the legend and the day panel: "all other days" for the one with no end (never the
// stored 2099 date), else each range as "20 Nov to 22 Nov" or "from 20 Nov onwards".
import type { SeasonColumn } from "@travel-crm/contracts/quotes";
import { formatCalendarDay } from "@/lib/format";
import { isOpenEnd } from "./departure-calendar-days";

/** The part of the translator the words need (the departuresCalendar messages). */
type Say = (key: "seasonOpen" | "rangeBetween" | "rangeOnwards", values?: Record<string, string>) => string;

export function seasonDates(say: Say, column: SeasonColumn): string {
  if (column.open) return say("seasonOpen");
  return column.ranges
    .map((range) =>
      isOpenEnd(range.endsOn)
        ? say("rangeOnwards", { from: formatCalendarDay(range.startsOn) })
        : say("rangeBetween", { from: formatCalendarDay(range.startsOn), to: formatCalendarDay(range.endsOn) }),
    )
    .join(", ");
}
