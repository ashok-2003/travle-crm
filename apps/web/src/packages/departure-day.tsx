"use client";

// A departure's side of the day panel: what it is (season, each room's price that day, seats) and, to whoever may
// change departures, the ways to change it; to whoever may see them, the way to its own page.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { roomTypes, seasonColumns, type PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { rupees } from "@/components/forms/money-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { CancelDepartureDialog } from "@/departures/cancel-departure-dialog";
import { useDepartureChanges } from "@/departures/use-departures";
import { departureRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { ChangeSeats, noPrices, OwnPrices, useChangeGate } from "./departure-edits";
import { columnIndexOn } from "./departure-calendar-days";
import { seasonDates } from "./season-words";

/** The price-table column whose dates cover the departure's first day (the legend's and the day's colour). */
function useSeasonColumn(detail: PackageDetail, departure: CalendarDeparture) {
  return useMemo(() => {
    const columns = seasonColumns(detail.seasons);
    const index = columnIndexOn(columns, departure.startDate);
    return index === null ? undefined : columns[index];
  }, [detail.seasons, departure.startDate]);
}

/** What the departure is: read by anyone who sees the panel, a day that has passed included. */
export function DepartureFacts({ detail, departure }: { detail: PackageDetail; departure: CalendarDeparture }) {
  const t = useTranslations("packages.departuresCalendar");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const column = useSeasonColumn(detail, departure);
  const priced = roomTypes.filter((room) => departure.prices[room] !== null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">
          {departure.seasonLabel === null ? t("seasonNone") : t("season", { label: departure.seasonLabel })}
        </p>
        {column !== undefined && (
          <p className="text-caption text-muted-foreground">{seasonDates(t, column, seasonColumns(detail.seasons))}</p>
        )}
        {departure.priceSource === "departure" && <p className="text-caption text-muted-foreground">{t("priceOwn")}</p>}
      </div>
      {priced.length > 0 && (
        <ul aria-label={t("pricesTitle")} className="numbers flex flex-col gap-1">
          {priced.map((room) => (
            <li key={room}>{t("roomPrice", { room: tRooms(room), price: rupees(departure.prices[room] ?? 0) })}</li>
          ))}
        </ul>
      )}
      <p>
        {t("seatsLine", {
          sold: departure.seatsSold,
          held: departure.seatsHeld,
          free: departure.seatsFree,
          total: departure.seatsTotal,
        })}
      </p>
    </div>
  );
}

/** "Use the season's prices": clears the departure's own prices. */
export function UseSeasonPrices({ departure }: { departure: CalendarDeparture }) {
  const t = useTranslations("packages.departuresCalendar");
  const gate = useChangeGate();
  const { setPrices } = useDepartureChanges();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={gate.disabled || setPrices.isPending}
        aria-describedby={gate.describedBy}
        onClick={() => {
          setPrices.mutate(
            { departureId: departure.departureId, prices: noPrices },
            {
              onSuccess: () => {
                toast.success(t("useSeasonDone"));
              },
            },
          );
        }}
      >
        {t("useSeason")}
      </Button>
      <RefusalAlert error={setPrices.error} />
      {gate.hint}
    </div>
  );
}

function Reopen({ departure }: { departure: CalendarDeparture }) {
  const t = useTranslations("packages.departuresCalendar");
  const gate = useChangeGate();
  const { reopen } = useDepartureChanges();
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground">{t("cancelledNote")}</p>
      <Button
        disabled={gate.disabled || reopen.isPending}
        aria-describedby={gate.describedBy}
        onClick={() => {
          reopen.mutate(
            { departureId: departure.departureId },
            {
              onSuccess: () => {
                toast.success(t("reopened"));
              },
            },
          );
        }}
      >
        {t("reopen")}
      </Button>
      <RefusalAlert error={reopen.error} />
      {gate.hint}
    </div>
  );
}

export function DepartureDay({ detail, departure }: { detail: PackageDetail; departure: CalendarDeparture }) {
  const t = useTranslations("packages.departuresCalendar");
  const mayChange = useHolds("departures:edit");
  const mayView = useHolds("departures:view");
  const column = useSeasonColumn(detail, departure);
  const cancelled = departure.status === "cancelled";
  return (
    <div className="flex flex-col items-start gap-4">
      <DepartureFacts detail={detail} departure={departure} />
      {cancelled && (mayChange ? <Reopen departure={departure} /> : <p>{t("cancelledNote")}</p>)}
      {mayChange && !cancelled && (
        <>
          <ChangeSeats key={`seats-${departure.departureId}`} departure={departure} />
          <OwnPrices key={`prices-${departure.departureId}`} detail={detail} departure={departure} column={column} />
          {departure.priceSource === "departure" && <UseSeasonPrices departure={departure} />}
          <CancelDepartureDialog departureId={departure.departureId} />
        </>
      )}
      {mayView && <TextLink href={departureRoute(departure.departureId)}>{t("open")}</TextLink>}
    </div>
  );
}
