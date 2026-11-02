// /settings/public-pages: whether the agency's public package pages are on, and what they say about the agency (release 7b).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicPagesSettingsScreen } from "@/packages/public-pages-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("packages.settings");
  return { title: t("title") };
}

export default function PublicPagesSettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <PublicPagesSettingsScreen />
    </RequirePermission>
  );
}
