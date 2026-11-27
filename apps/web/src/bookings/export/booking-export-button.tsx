"use client";

// The Bookings list's Export (bookings revamp, 2026-11-27), in its toolbar: the shared ExportButton for the list as it is
// on screen, its status chip, Filters and search included, as Excel or CSV, in the list's own order.
import type { BookingExportFilter } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { ExportButton } from "@/exports/export-button";
import { useBookingExportHolds } from "./booking-export-holds";
import { useBookingExportCalls } from "./use-booking-export-calls";

export function BookingExportButton({
  filter,
  salespersonName,
}: {
  filter: BookingExportFilter;
  /** The salesperson the filter names, when known. */
  salespersonName: string | null;
}) {
  const t = useTranslations("bookings.export");
  const holds = useBookingExportHolds();
  return (
    <ExportButton
      label={t("button")}
      title={t("dialog.title")}
      intro={t("dialog.intro")}
      holds={holds(filter, salespersonName)}
      rowsWord="bookings"
      calls={useBookingExportCalls(filter)}
    />
  );
}
