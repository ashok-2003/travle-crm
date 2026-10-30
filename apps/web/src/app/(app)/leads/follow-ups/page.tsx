// /leads/follow-ups: every open follow-up on a lead, with its WhatsApp chat and what the AI did (2026-10-30).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FollowUpsScreen } from "@/follow-ups/follow-ups-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks.followUps");
  return { title: t("title") };
}

export default function FollowUpsPage() {
  return (
    <RequirePermission permission="leads:view">
      <FollowUpsScreen />
    </RequirePermission>
  );
}
