"use client";

// A bookings export's page (bookings revamp, 2026-11-27), where the bell's "Your bookings export is ready" leads: what it
// holds, as the list showed it when it was asked for (the search is emptied once the file is made), its state, and
// Download until the file is deleted. Shared with the other exports by exports/export-screen.tsx.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/data/trpc";
import { ExportScreen } from "@/exports/export-screen";
import { routes } from "@/lib/routes";
import { useBookingExportHolds } from "./booking-export-holds";
import { useBookingExportCalls } from "./use-booking-export-calls";

export function BookingExportScreen({ exportId }: { exportId: string }) {
  const t = useTranslations("bookings.export");
  const trpc = useTRPC();
  const calls = useBookingExportCalls(null);
  const holds = useBookingExportHolds();
  // The same query as the shared screen's own (one key), for the filter it doesn't know.
  const { data: held } = useQuery(trpc.bookingExports.get.queryOptions({ exportId }));
  return (
    <ExportScreen
      title={t("title")}
      holds={held ? holds(held.filter, held.salespersonName) : ""}
      calls={calls}
      exportId={exportId}
      back={{ href: routes.bookings, label: t("back") }}
    />
  );
}
