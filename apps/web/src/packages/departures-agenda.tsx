"use client";

// The phone's month: the month's departures as a list ("Fri 27 Nov · ₹5,999 · 32 of 40 left"), month by arrows. A day
// with no departure is added from "Add a departure", which opens the panel on a day to pick.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { useHolds } from "@/session/me-context";
import { dateOf, dayWithWeekday, shiftMonth, type Day, type Month } from "./departure-calendar-days";
import { departureWords } from "./departures-month";

const monthName = (month: Month) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(dateOf(`${month}-01`));

export function DeparturesAgenda({
  departures,
  month,
  onMonthChange,
  onSelect,
  onAdd,
}: {
  departures: readonly CalendarDeparture[];
  month: Month;
  onMonthChange: (month: Month) => void;
  onSelect: (day: Day) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("packages.departuresCalendar");
  const mayAdd = useHolds("departures:create");
  const sorted = [...departures].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const label = (departure: CalendarDeparture) => {
    const day = dayWithWeekday(departure.startDate);
    const words = departureWords(departure);
    if (words.kind === "cancelled") return t("agendaLineCancelled", { day });
    const counts = { day, free: departure.seatsFree, total: departure.seatsTotal };
    return words.price === null
      ? t("agendaLineNoPrice", counts)
      : t("agendaLine", { ...counts, price: rupees(words.price) });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("previousMonth")}
          onClick={() => {
            onMonthChange(shiftMonth(month, -1));
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <h3 className="font-medium">{monthName(month)}</h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nextMonth")}
          onClick={() => {
            onMonthChange(shiftMonth(month, 1));
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-muted-foreground">{t("agendaEmpty", { month: monthName(month) })}</p>
      ) : (
        <ItemGroup aria-label={t("agendaTitle", { month: monthName(month) })}>
          {sorted.map((departure, index) => (
            <div key={departure.departureId} role="listitem">
              {index > 0 && <ItemSeparator />}
              <Item asChild>
                <button
                  type="button"
                  className="text-left"
                  onClick={() => {
                    onSelect(departure.startDate);
                  }}
                >
                  <ItemContent>
                    <ItemTitle className="numbers">{label(departure)}</ItemTitle>
                  </ItemContent>
                </button>
              </Item>
            </div>
          ))}
        </ItemGroup>
      )}
      {mayAdd && (
        <Button variant="outline" onClick={onAdd}>
          {t("agendaAdd")}
        </Button>
      )}
    </div>
  );
}
