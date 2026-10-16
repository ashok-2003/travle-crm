// /account/notifications: the signed-in person's own choice of what reaches them by email and push (spec 9.4).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationPreferencesScreen } from "@/notifications/preferences/preferences-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("preferences.title") };
}

export default function NotificationPreferencesPage() {
  return <NotificationPreferencesScreen />;
}
