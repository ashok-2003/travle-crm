"use client";

// A group trip's Departures card: its calendar (a month grid, two months from 1280px), each
// season in its own colour with a legend, a panel for the tapped day (under the months, or a sheet on a phone), and under
// it the weekly rule, the seats and the advance in words (repeats-line.tsx). The days come from departures.calendar, a
// month at a time, so a 1280px screen reads two and the arrows read the one that comes into view.
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
import { useMediaQuery } from "@/lib/use-media-query";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { dayWithWeekday, monthOf, shiftMonth, type Day, type Month } from "./departure-calendar-days";
import { DayPanel } from "./day-panel";
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
  // Two months only where a day stays wide enough for "₹12,300" (about 1280px): below that, one month.
  const twoMonths = useMediaQuery("(min-width: 1280px)");
  const today = useAgencyToday();
  const [month, setMonth] = useState<Month>(monthOf(today));
  const [selected, setSelected] = useState<Day | null>(null);
  const calendar = useDepartureCalendar(detail.id, month);
  const next = useDepartureCalendar(detail.id, shiftMonth(month, 1), twoMonths);
  const columns = useMemo(() => seasonColumns(detail.seasons), [detail.seasons]);
  const byDay = useMemo(
    () =>
      new Map<Day, CalendarDeparture>(
        [...(calendar.data ?? []), ...(twoMonths ? (next.data ?? []) : [])].map((departure) => [
          departure.startDate,
          departure,
        ]),
      ),
    [calendar.data, next.data, twoMonths],
  );
  if (detail.kind !== "group") return null;

  const goTo = (to: Month) => {
    setMonth(to);
    setSelected(null);
  };
  // A month that did not load, whichever of the shown ones: the days that did load stay out of reach until it does.
  const failed =
    [calendar, ...(twoMonths ? [next] : [])].find((read) => read.isError && read.data === undefined) ?? null;
  const loading =
    calendar.data === undefined ||
    calendar.isPlaceholderData ||
    (twoMonths && (next.data === undefined || next.isPlaceholderData));
  const panel =
    selected === null ? null : loading ? (
      <LoadingRows shape="twoLines" label={t("loading")} />
    ) : (
      <DayPanel key={selected} detail={detail} day={selected} departure={byDay.get(selected) ?? null} today={today} />
    );
  const months = (
    <div aria-label={t("calendarLabel")}>
      <DeparturesMonth
        columns={columns}
        byDay={byDay}
        month={month}
        onMonthChange={goTo}
        selected={selected}
        onSelect={setSelected}
        compact={!wide}
        twoMonths={twoMonths}
      />
    </div>
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
        {failed !== null ? (
          <LoadFailedAlert message={t("loadFailed")} error={failed.error} onRetry={() => void failed.refetch()} />
        ) : wide ? (
          <>
            {months}
            {panel !== null && (
              <>
                <Separator />
                <aside aria-label={t("panelLabel")}>{panel}</aside>
              </>
            )}
          </>
        ) : (
          <>
            {months}
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
