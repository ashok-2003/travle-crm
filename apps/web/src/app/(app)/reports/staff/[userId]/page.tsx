// /reports/staff/<id>: one staff member's performance and activity (sales execution).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffReportScreen } from "@/reports/staff-report-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.staff");
  return { title: t("title") };
}

export default async function StaffReportPage({ params }: PageProps<"/reports/staff/[userId]">) {
  const { userId } = await params;
  return (
    <RequirePermission permission="leads:view">
      <StaffReportScreen userId={userId} />
    </RequirePermission>
  );
}
