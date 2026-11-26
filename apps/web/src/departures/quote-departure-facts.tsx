"use client";

// What a quote's departure means for the traveller, at a glance: its link, its first day with the weekday, the seats left
// of the total, and where and when the group is picked up (the trip's pickup points, as its package states them).
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { PointList, pointsOf } from "@/components/trip-plan/point-list";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { TextLink } from "@/components/text-link";
import { formatCalendarDay, formatWeekday } from "@/lib/format";
import { departureRoute } from "@/lib/routes";
import { usePackage } from "@/packages/use-packages";
import { useDeparture } from "./use-departures";

export function QuoteDepartureFacts({ departure }: { departure: NonNullable<QuoteDetail["departure"]> }) {
  const t = useTranslations("departures.quote");
  const detail = useDeparture(departure.id);
  const templateId = detail.data?.templateId ?? null;
  const trip = usePackage(templateId ?? "", templateId !== null);
  const pickup = trip.data?.pickupPoints ?? "";
  const weekday = formatWeekday(new Date(`${departure.startDate}T00:00:00Z`), { timeZone: "UTC" });
  const failed = detail.isError ? detail : trip.isError ? trip : null;
  return (
    <div className="flex flex-col gap-2">
      {failed !== null && (
        <LoadFailedAlert message={t("loadFailed")} error={failed.error} onRetry={() => void failed.refetch()} />
      )}
      <p className="font-semibold">
        <TextLink inline href={departureRoute(departure.id)}>
          {departure.title}
        </TextLink>
      </p>
      <p>{t("startsOn", { weekday, day: formatCalendarDay(departure.startDate) })}</p>
      {detail.data !== undefined && <p>{t("seatsLeft", { free: detail.data.free, total: detail.data.seatsTotal })}</p>}
      {pointsOf(pickup).length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">{t("pickup")}</p>
          <PointList tone="plain" text={pickup} />
        </div>
      )}
    </div>
  );
}
