"use client";

// The Quotes list's Export (bookings revamp, 2026-11-27), in its toolbar: the shared ExportButton for the list as it is
// on screen, its status chip, Filters and search included, as Excel or CSV, in the list's own order.
import type { QuoteExportFilter } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { ExportButton } from "@/exports/export-button";
import { useQuoteExportHolds } from "./quote-export-holds";
import { useQuoteExportCalls } from "./use-quote-export-calls";

export function QuoteExportButton({
  filter,
  salespersonName,
}: {
  filter: QuoteExportFilter;
  /** The salesperson the filter names, when known. */
  salespersonName: string | null;
}) {
  const t = useTranslations("quotes.export");
  const holds = useQuoteExportHolds();
  return (
    <ExportButton
      label={t("button")}
      title={t("dialog.title")}
      intro={t("dialog.intro")}
      holds={holds(filter, salespersonName)}
      rowsWord="quotes"
      calls={useQuoteExportCalls(filter)}
    />
  );
}
