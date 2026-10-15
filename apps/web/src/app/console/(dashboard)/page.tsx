// /console: the console's dashboard, every organization at a glance (spec 7.4). In a route group of its own, so the
// console layout's title pattern applies to it: Next.js applies a layout's title template to the segments below it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DashboardScreen } from "@/console/dashboard/dashboard-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("console.dashboard");
  return { title: t("title") };
}

export default function ConsoleDashboardPage() {
  return <DashboardScreen />;
}
