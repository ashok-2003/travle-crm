// /settings/destinations: the agency's destinations, renamed and merged, for roles that may change settings (spec 3.6).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DestinationsScreen } from "@/crm-settings/destinations-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("destinations.title") };
}

export default function DestinationsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <DestinationsScreen />
    </RequirePermission>
  );
}
