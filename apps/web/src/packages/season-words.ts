// A season column's dates in words, one helper for the price table's header, the legend and the day panel: never the
// stored 2099 date. An open column that covers every day before it reads "all other days"; one that starts after other
// seasons reads "from 2 Jan onwards"; the rest list each range as "20 Nov to 22 Nov", joined by "and".
import type { SeasonColumn } from "@travel-crm/contracts/quotes";
import { formatCalendarDay } from "@/lib/format";
import { isOpenEnd } from "./departure-calendar-days";

/** The part of the translator the words need (the departuresCalendar messages). */
type Say = (
  key: "seasonOpen" | "rangeBetween" | "rangeOnwards" | "rangeJoin",
  values?: Record<string, string>,
) => string;

/** `columns`: every column of the trip, to tell whether an open one starts after other seasons. */
export function seasonDates(say: Say, column: SeasonColumn, columns: readonly SeasonColumn[]): string {
  const first = column.ranges[0]?.startsOn;
  if (column.open) {
    const afterOthers =
      first !== undefined &&
      columns.some((other) => other !== column && other.ranges.some((range) => range.startsOn < first));
    return afterOthers ? say("rangeOnwards", { from: formatCalendarDay(first) }) : say("seasonOpen");
  }
  return column.ranges
    .map((range) =>
      isOpenEnd(range.endsOn)
        ? say("rangeOnwards", { from: formatCalendarDay(range.startsOn) })
        : say("rangeBetween", { from: formatCalendarDay(range.startsOn), to: formatCalendarDay(range.endsOn) }),
    )
    .join(` ${say("rangeJoin")} `);
}
