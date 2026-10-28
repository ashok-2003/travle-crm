// /settings/ai: the agency's switch for Suggest reply and its instructions to the AI, for whoever manages it (Owner, Admin).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiSettingsScreen } from "@/ai/ai-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ai.settings");
  return { title: t("title") };
}

export default function AiSettingsPage() {
  return (
    <RequirePermission permission="ai:manage">
      <AiSettingsScreen />
    </RequirePermission>
  );
}
