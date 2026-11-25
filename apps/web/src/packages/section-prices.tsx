"use client";

// Prices & dates (/packages/<id>): the kind of trip and, for a group trip, what it sells and when it departs, summed up
// with Edit (prices-editor.tsx). A group trip then shows its price calendar with Add dates, its seasons with Add special
// prices, and its departures; the section holds the two dialogs and the days chosen on the calendar. A custom trip shows
// its From price (set in Page & files) and its tiers here instead.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/bookings/section-card";
import { Details } from "@/components/details";
import { rupees } from "@/components/forms/money-field";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Button } from "@/components/ui/button";
import { useDepartureList } from "@/departures/use-departures";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { AddDatesDialog } from "./add-dates-dialog";
import { MONTHS, WEEKDAYS } from "./group-fields";
import { PackageDeparturesCard } from "./package-departures-card";
import { PackageSection } from "./package-section";
import { PriceCalendar } from "./price-calendar";
import { PricesEditor } from "./prices-editor";
import { SeasonsCard } from "./seasons-card";
import { SpecialPricesDialog } from "./special-prices-dialog";
import { TiersCard } from "./tiers-card";

function PricesSummary({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const tSections = useTranslations("packages.sections");
  const notSet = tSections("notSet");
  const kind = { label: t("kind"), value: t(`kinds.${detail.kind}`) };
  if (detail.kind === "custom") {
    const price = detail.fromPricePaise === null ? notSet : rupees(detail.fromPricePaise);
    return <Details rows={[kind, { label: t("fromPrice"), value: price }]} />;
  }
  const days = WEEKDAYS.filter((day) => detail.weeklyDays.includes(Number(day))).map((day) => t(`weekdays.${day}`));
  const months = MONTHS.filter((month) => detail.departureMonths.includes(Number(month))).map((month) =>
    t(`months.${month}`),
  );
  return (
    <Details
      rows={[
        kind,
        {
          label: t("roomTypes"),
          value: detail.roomTypes.map((room) => t(`roomTypeNames.${room}`)).join(", ") || notSet,
        },
        { label: t("weeklyDays"), value: days.join(", ") || notSet },
        { label: t("departureMonths"), value: months.join(", ") || tSections("prices.everyMonth") },
        { label: t("seatsPerDeparture"), value: detail.seatsPerDeparture ?? notSet },
        {
          label: t("advancePerPerson"),
          value: detail.advancePerPersonPaise === null ? notSet : rupees(detail.advancePerPersonPaise),
        },
        { label: t("startCity"), value: detail.startCity || notSet },
      ]}
    />
  );
}

/** A group trip's departures for its calendar, ahead and cancelled, as one list that keeps its identity between renders. */
function useTripDepartures(packageId: string) {
  const upcoming = useDepartureList("upcoming", true, packageId);
  const cancelled = useDepartureList("cancelled", true, packageId);
  const departures = useMemo(
    () => (upcoming.data && cancelled.data ? [...upcoming.data, ...cancelled.data] : undefined),
    [upcoming.data, cancelled.data],
  );
  const failed = upcoming.isError ? upcoming : cancelled.isError ? cancelled : null;
  return { departures, failed };
}

/** A group trip's calendar, seasons and departures, and the dialogs for special prices and many dates. */
function GroupDates({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages");
  const mayEdit = useHolds("quotes:edit");
  const mayAddDates = useHolds("departures:create");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const { departures, failed } = useTripDepartures(detail.id);
  const [range, setRange] = useState({ from: "", to: "" });
  const [pricing, setPricing] = useState(false);
  const [adding, setAdding] = useState(false);
  // What opened a dialog (the day tapped last, or a button) takes the focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const openPrices = (from: string, to: string, by: HTMLElement | null) => {
    opener.current = by;
    setRange({ from, to });
    setPricing(true);
  };
  return (
    <>
      <SectionCard title={t("calendar.title")}>
        {departures !== undefined ? (
          <PriceCalendar
            detail={detail}
            departures={departures}
            onSelectRange={({ from, to }) => {
              openPrices(from, to, document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
        {mayAddDates && (
          <div>
            <Button
              variant="outline"
              disabled={!access.allowed}
              aria-describedby={access.allowed ? undefined : hintId}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setAdding(true);
              }}
            >
              {t("addDates.title")}
            </Button>
            <WriteHint id={hintId} hint={access.hint} />
          </div>
        )}
      </SectionCard>
      <SeasonsCard
        detail={detail}
        {...(mayEdit && {
          onAddSpecialPrices: (button: HTMLElement) => {
            openPrices("", "", button);
          },
        })}
      />
      <PackageDeparturesCard detail={detail} />
      <SpecialPricesDialog
        detail={detail}
        range={range}
        held={{ open: pricing, setOpen: setPricing }}
        returnFocusTo={opener}
      />
      <AddDatesDialog packageId={detail.id} held={{ open: adding, setOpen: setAdding }} returnFocusTo={opener} />
    </>
  );
}

export function PricesSection({ detail }: { detail: PackageDetail }) {
  return (
    <PackageSection
      section="prices"
      summary={<PricesSummary detail={detail} />}
      editor={(close) => <PricesEditor detail={detail} close={close} />}
    >
      {detail.kind === "group" ? <GroupDates detail={detail} /> : <TiersCard detail={detail} />}
    </PackageSection>
  );
}
