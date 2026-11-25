"use client";

// A group trip's Departures (/packages/<id>): its calendar. Until the departures calendar replaces this card it holds
// the price calendar over the trip's departures ahead and cancelled.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { SectionCard } from "@/bookings/section-card";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { useDepartureList } from "@/departures/use-departures";
import { sectionAnchors } from "./package-section";
import { PriceCalendar } from "./price-calendar";

export function DeparturesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages");
  const upcoming = useDepartureList("upcoming", true, detail.id);
  const cancelled = useDepartureList("cancelled", true, detail.id);
  const departures = useMemo(
    () => (upcoming.data && cancelled.data ? [...upcoming.data, ...cancelled.data] : undefined),
    [upcoming.data, cancelled.data],
  );
  const failed = upcoming.isError ? upcoming : cancelled.isError ? cancelled : null;
  return (
    <SectionCard title={t("sections.departures.title")} anchor={sectionAnchors.departures}>
      {departures !== undefined ? (
        <PriceCalendar
          detail={detail}
          departures={departures}
          onSelectRange={() => {
            // Special prices are set by Add season now; the calendar's range tool has no dialog to open.
          }}
        />
      ) : failed !== null ? (
        <LoadFailedAlert
          message={t("packageDepartures.loadFailed")}
          error={failed.error}
          onRetry={() => void failed.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("packageDepartures.loading")} />
      )}
    </SectionCard>
  );
}
