// /settings/notifications: who on the team gets email and copies of team alerts, for members who manage settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TeamRoutingScreen } from "@/notifications/team/team-routing-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications.team");
  return { title: t("title") };
}

export default function TeamNotificationsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <TeamRoutingScreen />
    </RequirePermission>
  );
}
