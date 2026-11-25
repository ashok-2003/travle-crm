"use client";

// A group trip's Departures card: its calendar (a month grid on a wide screen, the month's list on a phone), each season
// in its own colour with a legend, a panel for the tapped day (beside the grid, or a sheet on a phone), and under it the
// weekly rule, the seats and the advance in words (repeats-line.tsx). The days come from departures.calendar, a month at
// a time, so the arrows read the next month.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { seasonColumns, type PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { BOTTOM_SHEET_CLASSES } from "@/components/responsive-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dayWithWeekday } from "./departure-calendar-days";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { addDays, monthOf, type Day, type Month } from "./departure-calendar-days";
import { DayPanel } from "./day-panel";
import { DeparturesAgenda } from "./departures-agenda";
import { DeparturesMonth } from "./departures-month";
import { sectionAnchors } from "./package-section";
import { RepeatsLine } from "./repeats-line";
import { seasonDates } from "./season-words";
import { seasonTint } from "./season-colours";
import { useAgencyToday } from "./use-agency-today";
import { useDepartureCalendar } from "./use-departure-calendar";

export function DeparturesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.departuresCalendar");
  const headingId = useId();
  const wide = useWideScreen();
  const today = useAgencyToday();
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
    selected === null ? null : calendar.data === undefined || calendar.isPlaceholderData ? (
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
    <Card id={sectionAnchors.departures} role="region" aria-labelledby={headingId} className="scroll-mt-6">
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {columns.length > 0 && (
          <ul aria-label={t("legendTitle")} className="flex flex-wrap gap-x-6 gap-y-2">
            {columns.map((column, index) => (
              <li key={column.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={cn("size-4 shrink-0 rounded-sm", seasonTint(index).fill)} />
                <span>{t("legendRanges", { label: column.label, ranges: seasonDates(t, column, columns) })}</span>
              </li>
            ))}
          </ul>
        )}
        {calendar.isError && calendar.data === undefined ? (
          <LoadFailedAlert message={t("loadFailed")} error={calendar.error} onRetry={() => void calendar.refetch()} />
        ) : wide ? (
          <div className="flex flex-col gap-6 xl:flex-row">
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
                <Separator className="xl:hidden" />
                <Separator orientation="vertical" className="hidden h-auto xl:block" />
                <aside className="xl:w-80 xl:shrink-0">{panel}</aside>
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
                setSelected(addDays(today, 1));
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
