"use client";

// What a lead export holds, in the words the list shows its filters in (spec 3.3): "Everyone · Open · Hot · Goa · came in
// this week · matching "Sharma"". The owner and the destination are ids in the filter; whoever shows it names them.
import type { LeadExportFilter } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useShowWords } from "../list/show-chip";

export interface HeldNames {
  /** Null while not known: the words then say "Owner" or "The chosen destination". */
  ownerName: string | null;
  destinationName: string | null;
}

export function useLeadExportHolds(): (filter: LeadExportFilter, names: HeldNames) => string {
  const t = useTranslations("leads");
  const showWords = useShowWords();
  const views = { mine: t("list.mine"), everyone: t("list.everyone"), unassigned: t("list.unassigned") };
  return (filter, names) =>
    [
      views[filter.view],
      filter.stage === "open" ? t("list.open") : t(`stages.${filter.stage}`),
      filter.show === undefined ? null : showWords(filter.show, filter.view),
      filter.ownerUserId === undefined ? null : (names.ownerName ?? t("list.filtersDialog.owner")),
      filter.source === undefined ? null : t(`sources.${filter.source}`),
      filter.destinationId === undefined ? null : (names.destinationName ?? t("list.filtersDialog.chosen")),
      filter.tripType === undefined ? null : t(`tripTypes.${filter.tripType}`),
      filter.created === undefined ? null : t(`export.holds.created.${filter.created}`),
      filter.search === undefined ? null : t("export.holds.matching", { search: filter.search }),
    ]
      .filter((part) => part !== null)
      .join(" · ");
}
