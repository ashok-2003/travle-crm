// /settings/departures: how long seats are held, Filling fast, beds in a drafted room (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DepartureSettingsScreen } from "@/departures/departure-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("departures.settings");
  return { title: t("title") };
}

export default function DepartureSettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <DepartureSettingsScreen />
    </RequirePermission>
  );
}
