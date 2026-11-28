"use client";

// The Bookings list's Filters (bookings revamp, 2026-11-27): the trip lists' shared Filters (trip-filters.tsx: travel
// dates, and the salesperson for a member who sees every booking) with the payment added (paid in full, part paid,
// nothing received, overdue). Show bookings puts them in the address, Clear all lets every one go; the status chips and
// the search stay as they are. What is applied shows as chips over the rows (useAppliedChips), each letting its filter go.
import { bookingPaymentStates } from "@travel-crm/contracts/bookings";
import type { LeadWorker } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import type { AppliedFilter } from "@/components/data-table/applied-filters";
import {
  TripFiltersDialog,
  useTripChips,
  type Salespeople,
  type TripFilters,
} from "@/components/data-table/trip-filters";
import type { BookingsAddress } from "./list-address";

/** What Filters sets: the travel dates, the salesperson and the payment. */
export type BookingFilters = Pick<BookingsAddress, "travelFrom" | "travelTo" | "ownerUserId" | "payment">;

/** The shared filters' own select back as the payment state it chose, or none. */
function bookingFiltersOf({ choice, ...trip }: TripFilters): BookingFilters {
  return { ...trip, payment: bookingPaymentStates.find((state) => state === choice) };
}

/** The applied filters as chips, each letting its own go. */
export function useAppliedChips(
  filters: BookingFilters,
  salespeople: LeadWorker[] | undefined,
  onApply: (filters: BookingFilters) => void,
): AppliedFilter[] {
  const t = useTranslations("bookings.list");
  const trip = useTripChips(filters, salespeople, (next) => {
    onApply({ ...filters, ...next });
  });
  const { payment } = filters;
  if (payment === undefined) return trip;
  const state = t(`filtersDialog.payments.${payment}`);
  return [
    ...trip,
    {
      label: t("applied.payment", { state }),
      onRemove: () => {
        onApply({ ...filters, payment: undefined });
      },
    },
  ];
}

export function BookingsFilters({
  filters,
  chosen,
  salespeople,
  opener,
  onApply,
}: {
  filters: BookingFilters;
  /** How many chips the applied filters make. */
  chosen: number;
  salespeople: Salespeople | null;
  /** The Filters button, which takes the focus back when the dialog closes or a chip goes. */
  opener: RefObject<HTMLButtonElement | null>;
  onApply: (filters: BookingFilters) => void;
}) {
  const t = useTranslations("bookings.list");
  const { payment, ...trip } = filters;
  return (
    <TripFiltersDialog
      filters={{ ...trip, choice: payment }}
      chosen={chosen}
      salespeople={salespeople}
      choice={{
        label: t("filtersDialog.payment"),
        anyLabel: t("filtersDialog.anyPayment"),
        options: bookingPaymentStates.map((state) => ({ value: state, label: t(`filtersDialog.payments.${state}`) })),
      }}
      opener={opener}
      words={{
        button: t("filtersButton"),
        chosen: t("filtersChosen", { count: chosen }),
        title: t("filtersDialog.title"),
        description: t("filtersDialog.description"),
        clear: t("filtersDialog.clear"),
        apply: t("filtersDialog.apply"),
      }}
      onApply={(next) => {
        onApply(bookingFiltersOf(next));
      }}
    />
  );
}
