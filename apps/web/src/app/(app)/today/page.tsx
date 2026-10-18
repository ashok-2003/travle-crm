// /today: the signed-in person's day (spec 3.5): overdue, new leads not contacted yet and due today, for anyone whose
// role sees leads.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequirePermission } from "@/session/require-permission";
import { TodayScreen } from "@/today/today-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today");
  return { title: t("title") };
}

export default function TodayPage() {
  return (
    <RequirePermission permission="leads:view">
      <TodayScreen />
    </RequirePermission>
  );
}
