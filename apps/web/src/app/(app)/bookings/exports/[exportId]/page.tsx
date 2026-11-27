// /bookings/exports/<id>: a bookings export's page (bookings revamp, 2026-11-27), where the bell's "Your bookings export
// is ready" leads, for members whose role sees bookings. It is an export (ADR 0021): a read-only agency still downloads
// from it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingExportScreen } from "@/bookings/export/booking-export-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookings.export");
  return { title: t("title") };
}

export default async function BookingExportPage({ params }: PageProps<"/bookings/exports/[exportId]">) {
  const { exportId } = await params;
  return (
    <RequirePermission permission="bookings:view">
      <BookingExportScreen exportId={exportId} />
    </RequirePermission>
  );
}
