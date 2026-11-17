// /console/updates: what is broken now and the last week's incidents, and a super admin's platform alerts on this device.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UpdatesScreen } from "@/console/updates/updates-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("console.updates");
  return { title: t("title") };
}

export default function ConsoleUpdatesPage() {
  return <UpdatesScreen />;
}
