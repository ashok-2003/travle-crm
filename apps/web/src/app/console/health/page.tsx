// /console/health: what is broken now and the last week's incidents (the dashboard links here).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HealthScreen } from "@/console/health/health-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("console.health");
  return { title: t("title") };
}

export default function ConsoleHealthPage() {
  return <HealthScreen />;
}
