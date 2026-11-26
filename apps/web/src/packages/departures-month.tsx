"use client";

// The month grid of a trip's departures, on a phone (one month, compact) and on a wide screen (two): the registry
// Calendar with a custom day. A departure's day is in its season's colour (the only thing colour says) and reads its
// price and seats in words: "3 left" in bold when few, "Full" with the price struck through, "Cancelled" struck
// through, "No price" in no season. The arrows move one month (the card reads the days); a tap selects a day.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import type { SeasonColumn } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useMemo, type ComponentProps } from "react";
import type { DayButton } from "react-day-picker";
import { enIN } from "react-day-picker/locale";
import { rupees } from "@/components/forms/money-field";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { formatCalendarDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dateOf, dayKeyOf, FEW_SEATS, lowestPrice, monthOf, type Day, type Month } from "./departure-calendar-days";
import { seasonTint } from "./season-colours";

/** How a departure reads on its day, and in the day's spoken name. */
function departureWords(departure: CalendarDeparture) {
  const price = lowestPrice(departure.prices);
  if (departure.status === "cancelled") return { kind: "cancelled", price } as const;
  return { kind: departure.seatsFree === 0 ? "full" : "open", price } as const;
}

export function DeparturesMonth({
  columns,
  byDay,
  month,
  onMonthChange,
  selected,
  onSelect,
  compact,
}: {
  columns: readonly SeasonColumn[];
  byDay: ReadonlyMap<Day, CalendarDeparture>;
  month: Month;
  onMonthChange: (month: Month) => void;
  selected: Day | null;
  onSelect: (day: Day) => void;
  /** A phone: one month, days that fill the card, a price without its rupee sign (the day's name keeps it). */
  compact: boolean;
}) {
  const t = useTranslations("packages.departuresCalendar");
  // Only a departure's day is coloured (the owner, 2026-11-25): by the season it falls in, else plain grey. A dated
  // season wins over the open one, which covers all other days (as the legend says).
  const covers = (column: SeasonColumn, day: Day) =>
    column.ranges.some((range) => range.startsOn <= day && day <= range.endsOn);
  const seasonOf = (day: Day) => {
    const dated = columns.findIndex((column) => !column.open && covers(column, day));
    return dated === -1 ? columns.findIndex((column) => column.open && covers(column, day)) : dated;
  };
  const days = [...byDay.keys()];
  const modifiers = {
    ...Object.fromEntries(
      columns.map((_column, index) => [
        `season${String(index)}`,
        days.filter((day) => seasonOf(day) === index).map(dateOf),
      ]),
    ),
  };
  const modifiersClassNames = {
    ...Object.fromEntries(
      columns.map((_column, index) => [`season${String(index)}`, `${seasonTint(index).fill} ${seasonTint(index).ink}`]),
    ),
  };

  const dayLabel = (date: Date) => {
    const key = dayKeyOf(date);
    const day = formatCalendarDay(key);
    const departure = byDay.get(key);
    if (departure === undefined) return day;
    const words = departureWords(departure);
    if (words.kind === "cancelled") return t("dayCancelled", { day });
    if (words.kind === "full")
      return words.price === null ? t("dayFullNoPrice", { day }) : t("dayFull", { day, price: rupees(words.price) });
    return words.price === null
      ? t("dayNoPrice", { day, free: departure.seatsFree })
      : t("dayDeparture", { day, price: rupees(words.price), free: departure.seatsFree });
  };

  const DepartureDayButton = useMemo(
    () =>
      function DepartureDayButton(props: ComponentProps<typeof DayButton>) {
        const departure = byDay.get(dayKeyOf(props.day.date));
        const words = departure === undefined ? null : departureWords(departure);
        return (
          <CalendarDayButton
            locale={enIN}
            {...props}
            className={cn(
              props.className,
              // A box that grows with its words, not the registry's square or round day, and never wider than its column.
              "h-full min-h-14 min-w-0 aspect-auto items-center justify-start gap-0.5 rounded-md p-0.5 text-inherit [&>span]:text-caption [&>span]:opacity-100",
              // A phone's day is about 46px wide (41px at 360px): its words must fit that, so they shrink a little.
              compact ? "[&>span]:text-micro" : "items-start p-1.5 text-left",
            )}
          >
            {props.children}
            {departure !== undefined && words !== null && (
              <>
                {words.kind === "cancelled" && <span className="line-through">{t("cancelled")}</span>}
                {words.kind !== "cancelled" && words.price === null && <span>{t("noPrice")}</span>}
                {words.kind !== "cancelled" && words.price !== null && (
                  <span className={cn("numbers font-medium", words.kind === "full" && "line-through")}>
                    {compact ? rupees(words.price).replace("₹", "") : rupees(words.price)}
                  </span>
                )}
                {words.kind === "full" && <span>{t("full")}</span>}
                {words.kind === "open" && (
                  <span className={cn(departure.seatsFree <= FEW_SEATS && "font-bold")}>
                    {t("seatsLeft", { free: departure.seatsFree })}
                  </span>
                )}
              </>
            )}
          </CalendarDayButton>
        );
      },
    [byDay, compact, t],
  );

  return (
    <Calendar
      mode="single"
      month={dateOf(`${month}-01`)}
      onMonthChange={(next) => {
        onMonthChange(monthOf(dayKeyOf(next)));
      }}
      showOutsideDays={false}
      selected={selected === null ? undefined : dateOf(selected)}
      onDayClick={(date) => {
        onSelect(dayKeyOf(date));
      }}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
      numberOfMonths={compact ? 1 : 2}
      classNames={{
        root: "w-full",
        // The registry's day without its square: a day's height comes from its words.
        day: "group/day relative h-full w-full rounded-(--cell-radius) p-0 text-center select-none",
        today: "underline",
      }}
      components={{ DayButton: DepartureDayButton }}
      labels={{ labelDayButton: dayLabel }}
      className="p-0"
    />
  );
}
