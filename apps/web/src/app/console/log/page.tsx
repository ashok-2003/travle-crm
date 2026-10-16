// /console/log: what platform staff and the platform's own jobs did, newest first (spec 5, 7).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LogScreen } from "@/console/log/log-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.log");
  return { title: t("title") };
}

export default function ConsoleLogPage() {
  return <LogScreen />;
}
