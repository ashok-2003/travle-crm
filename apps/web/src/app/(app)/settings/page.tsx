// /settings: the organization's code and its sign-in security, for members whose role may change settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsScreen } from "@/organization/settings/settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <SettingsScreen />
    </RequirePermission>
  );
}
