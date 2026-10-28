// /console/usage: how every organization uses the product, and what its AI costs.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UsageScreen } from "@/console/growth/usage-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleGrowth.usage");
  return { title: t("title") };
}

export default function ConsoleUsagePage() {
  return <UsageScreen />;
}
