// /staff/exports/<exportId>: a staff export's page, where the bell's "ready" notice leads.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffExportScreen } from "@/organization/staff/export/staff-export-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff.export");
  return { title: t("pageTitle") };
}

export default async function StaffExportPage({ params }: PageProps<"/staff/exports/[exportId]">) {
  const { exportId } = await params;
  return (
    <RequirePermission permission="staff:manage">
      <StaffExportScreen exportId={exportId} />
    </RequirePermission>
  );
}
