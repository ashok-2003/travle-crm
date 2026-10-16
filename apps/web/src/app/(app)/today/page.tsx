// /today: the signed-in person's day (release 1). Track W builds its screen; until then the address answers with the
// screen's title, so the navigation's link, which Next prefetches while it is in view, finds a page.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.navigation");
  return { title: t("today") };
}

export default async function TodayPage() {
  const t = await getTranslations("shell.navigation");
  return (
    <RequirePermission permission="leads:view">
      <PageHeader title={t("today")} />
    </RequirePermission>
  );
}
