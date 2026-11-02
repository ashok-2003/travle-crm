// /console/ai: every AI call, what it cost, and which agency's AI works now.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiUsageScreen } from "@/console/ai/ai-usage-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleAi");
  return { title: t("title") };
}

export default function ConsoleAiPage() {
  return <AiUsageScreen />;
}
