// /settings/whatsapp: the agency's WhatsApp number and how it is doing (spec 3.4).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WhatsappSettingsScreen } from "@/inbox/whatsapp-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox.settings");
  return { title: t("title") };
}

export default function WhatsappSettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <WhatsappSettingsScreen />
    </RequirePermission>
  );
}
