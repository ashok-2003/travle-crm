// /settings/bookings: how the agency's bookings run: payment schedule, reminders, cancellation steps (release 6).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingSettingsScreen } from "@/bookings/booking-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookings.settings");
  return { title: t("title") };
}

export default function BookingSettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <BookingSettingsScreen />
    </RequirePermission>
  );
}
