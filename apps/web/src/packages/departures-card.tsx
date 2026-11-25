"use client";

// A group trip's Departures card: its calendar (a month grid on a wide screen, the month's list on a phone), each season
// in its own colour with a legend, a panel for the tapped day (beside the grid, or a sheet on a phone), and under it the
// weekly rule, the seats and the advance in words (repeats-line.tsx). The days come from departures.calendar, a month at
// a time, so the arrows read the next month.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { seasonColumns, type PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { BOTTOM_SHEET_CLASSES } from "@/components/responsive-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dayWithWeekday } from "./departure-calendar-days";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { dayKeyOf, monthOf, type Day, type Month } from "./departure-calendar-days";
import { DayPanel } from "./day-panel";
import { DeparturesAgenda } from "./departures-agenda";
import { DeparturesMonth } from "./departures-month";
import { RepeatsLine } from "./repeats-line";
import { seasonDates } from "./season-words";
import { seasonTint } from "./season-colours";
import { useDepartureCalendar } from "./use-departure-calendar";

export function DeparturesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.departuresCalendar");
  const wide = useWideScreen();
  const today = dayKeyOf(new Date());
  const [month, setMonth] = useState<Month>(monthOf(today));
  const [selected, setSelected] = useState<Day | null>(null);
  const [picking, setPicking] = useState(false);
  const calendar = useDepartureCalendar(detail.id, month);
  const columns = useMemo(() => seasonColumns(detail.seasons), [detail.seasons]);
  const byDay = useMemo(
    () => new Map<Day, CalendarDeparture>((calendar.data ?? []).map((departure) => [departure.startDate, departure])),
    [calendar.data],
  );
  if (detail.kind !== "group") return null;

  const goTo = (next: Month) => {
    setMonth(next);
    setSelected(null);
  };
  // A day in another month is read from that month: the panel waits for it.
  const pickDay = (day: Day) => {
    setMonth(monthOf(day));
    setSelected(day);
  };
  const panel =
    selected === null ? null : calendar.data === undefined ? (
      <LoadingRows shape="twoLines" label={t("loading")} />
    ) : (
      <DayPanel
        key={selected}
        detail={detail}
        day={selected}
        departure={byDay.get(selected) ?? null}
        today={today}
        pickDay={picking}
        onDayChange={pickDay}
      />
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {columns.length > 0 && (
          <ul aria-label={t("legendTitle")} className="flex flex-wrap gap-x-6 gap-y-2">
            {columns.map((column, index) => (
              <li key={column.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={cn("size-4 shrink-0 rounded-sm", seasonTint(index).fill)} />
                <span>
                  {column.open
                    ? t("legendOpen", { label: column.label })
                    : t("legendRanges", { label: column.label, ranges: seasonDates(t, column) })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {calendar.isError && calendar.data === undefined ? (
          <LoadFailedAlert message={t("loadFailed")} error={calendar.error} onRetry={() => void calendar.refetch()} />
        ) : wide ? (
          <div className="flex gap-6">
            <div className="min-w-0 flex-1" aria-label={t("calendarLabel")}>
              <DeparturesMonth
                columns={columns}
                byDay={byDay}
                month={month}
                onMonthChange={goTo}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
            {panel !== null && (
              <>
                <Separator orientation="vertical" className="h-auto" />
                <aside className="w-80 shrink-0">{panel}</aside>
              </>
            )}
          </div>
        ) : (
          <>
            <DeparturesAgenda
              departures={calendar.data ?? []}
              month={month}
              onMonthChange={goTo}
              onSelect={(day) => {
                setPicking(false);
                setSelected(day);
              }}
              onAdd={() => {
                setPicking(true);
                setSelected(dayKeyOf(new Date(Date.now() + 86_400_000)));
              }}
            />
            <Sheet
              open={selected !== null}
              onOpenChange={(open) => {
                if (!open) setSelected(null);
              }}
            >
              <SheetContent side="bottom" className={BOTTOM_SHEET_CLASSES}>
                <SheetHeader>
                  <SheetTitle>{selected === null ? t("title") : dayWithWeekday(selected)}</SheetTitle>
                  <SheetDescription>{t("panelDescription")}</SheetDescription>
                </SheetHeader>
                <div className="p-4 pt-0">{panel}</div>
              </SheetContent>
            </Sheet>
          </>
        )}
        <Separator />
        <RepeatsLine detail={detail} />
      </CardContent>
    </Card>
  );
}
