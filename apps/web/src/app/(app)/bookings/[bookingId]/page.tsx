// /bookings/<id>: one booking, its money, travellers, trip and reminders (release 6); one out of the member's scope is "not found".
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingScreen } from "@/bookings/booking-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookings.booking");
  return { title: t("title") };
}

export default async function BookingPage({ params }: PageProps<"/bookings/[bookingId]">) {
  const { bookingId } = await params;
  return (
    <RequirePermission permission="bookings:view">
      <BookingScreen bookingId={bookingId} />
    </RequirePermission>
  );
}
