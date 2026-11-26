"use client";

// What a quote's departure means for the traveller, at a glance: its link, its first day with the weekday, the seats left
// of the total, and where and when the group is picked up (the trip's pickup points, as its package states them). All of
// it comes with the quote, so whoever sees the quote reads it; an older api sends only the link and the day.
import { pointsOf, type QuoteDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { PointList } from "@/components/trip-plan/point-list";
import { TextLink } from "@/components/text-link";
import { formatCalendarDay, formatWeekday } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { departureRoute } from "@/lib/routes";

export function QuoteDepartureFacts({ departure }: { departure: NonNullable<QuoteDetail["departure"]> }) {
  const t = useTranslations("departures.quote");
  const total = mayBeMissing(departure.seatsTotal);
  const free = mayBeMissing(departure.free);
  const pickup = mayBeMissing(departure.pickupPoints) ?? "";
  const weekday = formatWeekday(new Date(`${departure.startDate}T00:00:00Z`), { timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">
        <TextLink inline href={departureRoute(departure.id)}>
          {departure.title}
        </TextLink>
      </p>
      <p>{t("startsOn", { weekday, day: formatCalendarDay(departure.startDate) })}</p>
      {total !== undefined && free !== undefined && <p>{t("seatsLeft", { free, total })}</p>}
      {pointsOf(pickup).length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">{t("pickup")}</p>
          <PointList tone="plain" text={pickup} />
        </div>
      )}
    </div>
  );
}
