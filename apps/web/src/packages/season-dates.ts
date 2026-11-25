// A season column's dates in words, never the open end of time: "all other days" for the column that runs with no end
// (or "from 2 Jan onwards" when it is the only piece of its own and other seasons exist), and "18 Dec to 1 Jan" for a
// range, a column of several ranges listing them.
import { OPEN_SEASON_END, type SeasonColumn } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { formatCalendarDay } from "@/lib/format";

export function useSeasonDates() {
  const t = useTranslations("packages.prices");
  return (column: SeasonColumn, columnCount: number): string => {
    const first = column.ranges[0];
    if (column.open) {
      return first !== undefined && column.ranges.length === 1 && columnCount > 1
        ? t("fromOnwards", { day: formatCalendarDay(first.startsOn) })
        : t("allOtherDays");
    }
    return column.ranges
      .map((range) =>
        range.endsOn === OPEN_SEASON_END
          ? t("fromOnwards", { day: formatCalendarDay(range.startsOn) })
          : t("range", { from: formatCalendarDay(range.startsOn), to: formatCalendarDay(range.endsOn) }),
      )
      .join(" · ");
  };
}
