"use client";

// What a bookings export holds, in the words the list shows its filters in (bookings revamp, 2026-11-27): "Confirmed ·
// Travel 1 Dec to 31 Dec · Salesperson: Ravi Kumar · Payment: Overdue · matching "Meera"", or "Every booking". The
// salesperson is an id in the filter; whoever shows it names them.
import type { BookingExportFilter } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { useTripWords } from "@/components/data-table/trip-filters";

export function useBookingExportHolds(): (filter: BookingExportFilter, salespersonName: string | null) => string {
  const t = useTranslations("bookings");
  const tTable = useTranslations("common.table");
  const tripWords = useTripWords();
  return (filter, salespersonName) => {
    const { travel, salesperson } = tripWords(filter, salespersonName);
    const { claimsPending, status, payment, search } = filter;
    const chip =
      claimsPending === true ? t("list.filters.claims") : status === undefined ? null : t(`list.filters.${status}`);
    const paymentWords =
      payment === undefined ? null : t("list.applied.payment", { state: t(`list.filtersDialog.payments.${payment}`) });
    const parts = [
      chip,
      travel,
      salesperson,
      paymentWords,
      search === undefined || search === "" ? null : tTable("matching", { search }),
    ].filter((part) => part !== null);
    return parts.length === 0 ? t("export.holds.all") : parts.join(" · ");
  };
}
