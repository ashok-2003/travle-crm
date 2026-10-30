// /bookings: the member's bookings, or the agency's for a role that sees them all (release 6).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingsScreen } from "@/bookings/bookings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookings.list");
  return { title: t("title") };
}

export default function BookingsPage() {
  return (
    <RequirePermission permission="bookings:view">
      <BookingsScreen />
    </RequirePermission>
  );
}
