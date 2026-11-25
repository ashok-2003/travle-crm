"use client";

// The desktop month grid of a trip's departures (Google Calendar's month view): the registry Calendar with larger days,
// each in its season's colour, a departure's lowest price and seats left on its day, "Cancelled" and "Full" where they
// are. The arrows change the month (the card reads that month's days); tapping a day selects it for the panel.
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
import { dateOf, dayKeyOf, lowestPrice, monthOf, type Day, type Month } from "./departure-calendar-days";
import { seasonTint } from "./season-colours";

/** How a departure reads on its day, and in the day's spoken name. */
export function departureWords(departure: CalendarDeparture) {
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
}: {
  columns: readonly SeasonColumn[];
  byDay: ReadonlyMap<Day, CalendarDeparture>;
  month: Month;
  onMonthChange: (month: Month) => void;
  selected: Day | null;
  onSelect: (day: Day) => void;
}) {
  const t = useTranslations("packages.departuresCalendar");
  const modifiers = Object.fromEntries(
    columns.map((column, index) => [
      `season${String(index)}`,
      column.ranges.map((range) => ({ from: dateOf(range.startsOn), to: dateOf(range.endsOn) })),
    ]),
  );
  const modifiersClassNames = Object.fromEntries(
    columns.map((_column, index) => [`season${String(index)}`, `${seasonTint(index).fill} ${seasonTint(index).ink}`]),
  );

  const dayLabel = (date: Date) => {
    const key = dayKeyOf(date);
    const day = formatCalendarDay(key);
    const departure = byDay.get(key);
    if (departure === undefined) return day;
    const words = departureWords(departure);
    if (words.kind === "cancelled") return t("dayCancelled", { day });
    if (words.kind === "full") return t("dayFull", { day });
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
              "h-full items-start justify-start p-1.5 text-left text-inherit [&>span]:opacity-100",
            )}
          >
            {props.children}
            {departure !== undefined && words !== null && (
              <>
                {words.kind === "cancelled" && <span>{t("cancelled")}</span>}
                {words.kind === "full" && <span>{t("full")}</span>}
                {words.kind !== "cancelled" && words.price !== null && (
                  <span className="numbers font-medium">{rupees(words.price)}</span>
                )}
                {words.kind === "open" && <span>{t("seatsLeft", { free: departure.seatsFree })}</span>}
              </>
            )}
          </CalendarDayButton>
        );
      },
    [byDay, t],
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
      classNames={{ today: "underline" }}
      components={{ DayButton: DepartureDayButton }}
      labels={{ labelDayButton: dayLabel }}
      className="min-[360px]:[--cell-size:--spacing(16)]"
    />
  );
}
