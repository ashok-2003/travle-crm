// /settings/ai: the AI sales agent: whether it answers customers by itself, how it speaks, what it knows.
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
    <RequirePermission permission="settings:manage">
      <AiSettingsScreen />
    </RequirePermission>
  );
}
