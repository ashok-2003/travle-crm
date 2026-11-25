"use client";

// Prices (/packages/<id>): for a group trip, Add season first and the price table under it; for a custom trip, its From
// price (set in Page and AI) with its tiers after. Seasons are the dates a set of prices holds, so there is one place to
// say "from these days, this much".
import { roomTypes, seasonColumns, type PackageDetail } from "@travel-crm/contracts/quotes";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/bookings/section-card";
import { Details } from "@/components/details";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { shownRoomTypes } from "@/room-prices/room-prices";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { sectionAnchors } from "./package-section";
import { PriceTable } from "./price-table";
import { AddSeasonDialog } from "./season-dialog";
import { TiersCard } from "./tiers-card";

/** A group trip's prices: Add season, then the table. */
export function PricesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.prices");
  const mayEdit = useHolds("quotes:edit");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const [adding, setAdding] = useState(false);
  // Unsaved price changes in the table: a season change would read the trip again and drop them.
  const [edited, setEdited] = useState(false);
  const onEdited = useCallback((next: boolean) => {
    setEdited(next);
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  const first = useMemo(() => seasonColumns(detail.seasons)[0], [detail.seasons]);
  // A trip that sells nothing yet offers every room type for its first season; the table then saves the ones priced.
  const rooms =
    first === undefined && detail.roomTypes.length === 0
      ? [...roomTypes]
      : shownRoomTypes(detail.roomTypes, first?.prices);
  return (
    <SectionCard title={t("title")} anchor={sectionAnchors.prices}>
      <p className="text-muted-foreground">{t("caption", { gst: detail.pricesIncludeGst ? "including" : "before" })}</p>
      {mayEdit && (
        <div>
          <Button
            variant="outline"
            disabled={!access.allowed || edited}
            aria-describedby={access.allowed && !edited ? undefined : hintId}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setAdding(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("addSeason")}
          </Button>
          <WriteHint id={hintId} hint={access.hint ?? (edited ? t("unsavedHint") : null)} />
        </div>
      )}
      {/* A new key when the trip is read again: the table starts from what was saved. */}
      <PriceTable key={JSON.stringify([detail.roomTypes, detail.seasons])} detail={detail} onEdited={onEdited} />
      <AddSeasonDialog
        packageId={detail.id}
        rooms={rooms}
        prefill={first?.prices}
        pricesIncludeGst={detail.pricesIncludeGst}
        held={{ open: adding, setOpen: setAdding }}
        returnFocusTo={opener}
      />
    </SectionCard>
  );
}

/** A custom trip's prices: the From price it shows (typed in Page and AI), and its tiers. */
export function CustomPricesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.prices");
  const tForm = useTranslations("packages.form");
  const notSet = useTranslations("packages.sections")("notSet");
  return (
    <>
      <SectionCard title={t("title")} anchor={sectionAnchors.prices}>
        <Details
          rows={[
            {
              label: tForm("fromPrice"),
              value: detail.fromPricePaise === null ? notSet : rupees(detail.fromPricePaise),
              hint: t("custom.fromHint"),
            },
          ]}
        />
      </SectionCard>
      <TiersCard detail={detail} />
    </>
  );
}
