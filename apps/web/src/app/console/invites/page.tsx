// /console/invites: the invite-only program's invites, their links and how each has done.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InvitesScreen } from "@/console/growth/invites-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleGrowth.invites");
  return { title: t("title") };
}

export default function ConsoleInvitesPage() {
  return <InvitesScreen />;
}
