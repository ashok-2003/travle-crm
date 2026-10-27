// /reports: reports and analytics (sales execution): the agency's, with its team, or the member's own.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReportsScreen } from "@/reports/reports-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("title") };
}

export default function ReportsPage() {
  return (
    <RequirePermission permission="leads:view">
      <ReportsScreen />
    </RequirePermission>
  );
}
