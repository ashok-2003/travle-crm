"use client";

// What a quotes export holds, in the words the list shows its filters in (bookings revamp, 2026-11-27): "Money to come ·
// Travel 1 Dec to 31 Dec · Salesperson: Ravi Kumar · matching "Meera"", a status by its own word ("Sent"), or "Every
// quote". The salesperson is an id in the filter; whoever shows it names them.
import type { QuoteExportFilter } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useTripWords } from "@/components/data-table/trip-filters";

export function useQuoteExportHolds(): (filter: QuoteExportFilter, salespersonName: string | null) => string {
  const t = useTranslations("quotes");
  const tTable = useTranslations("common.table");
  const tripWords = useTripWords();
  return (filter, salespersonName) => {
    const { travel, salesperson } = tripWords(filter, salespersonName);
    const { balanceDue, status, search } = filter;
    const chip = balanceDue === true ? t("list.filters.due") : status === undefined ? null : t(`status.${status}`);
    const parts = [
      chip,
      travel,
      salesperson,
      search === undefined || search === "" ? null : tTable("matching", { search }),
    ].filter((part) => part !== null);
    return parts.length === 0 ? t("export.holds.all") : parts.join(" · ");
  };
}
