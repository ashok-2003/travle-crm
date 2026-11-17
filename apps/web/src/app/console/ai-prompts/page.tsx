// /console/ai-prompts: the lite WhatsApp agent's prompt library, a super admin's.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PromptLibraryScreen } from "@/console/ai/prompt-library-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleAi.prompts");
  return { title: t("title") };
}

export default function ConsoleAiPromptsPage() {
  return <PromptLibraryScreen />;
}
