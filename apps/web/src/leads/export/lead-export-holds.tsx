"use client";

// What a lead export holds, in the words the list shows its filters in (spec 3.3): "Everyone · Open · Goa · matching
// "Sharma"". The owner and the destination are ids in the filter; whoever shows it names them.
import type { LeadExportFilter } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";

export interface HeldNames {
  /** Null while not known: the words then say "Owner" or "The chosen destination". */
  ownerName: string | null;
  destinationName: string | null;
}

export function useLeadExportHolds(): (filter: LeadExportFilter, names: HeldNames) => string {
  const t = useTranslations("leads");
  return (filter, names) =>
    [
      filter.view === "everyone" ? t("list.everyone") : t("list.mine"),
      filter.stage === "open" ? t("list.open") : t(`stages.${filter.stage}`),
      filter.ownerUserId === undefined ? null : (names.ownerName ?? t("list.filtersDialog.owner")),
      filter.source === undefined ? null : t(`sources.${filter.source}`),
      filter.destinationId === undefined ? null : (names.destinationName ?? t("list.filtersDialog.chosen")),
      filter.tripType === undefined ? null : t(`tripTypes.${filter.tripType}`),
      filter.search === undefined ? null : t("export.holds.matching", { search: filter.search }),
    ]
      .filter((part) => part !== null)
      .join(" · ");
}
