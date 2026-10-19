// /leads/exports/<id>: a lead export's page (spec 3.3), where the bell's "Your leads export is ready" leads, for
// members whose role sees leads. It is an export (ADR 0021): a read-only agency still downloads from it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadExportScreen } from "@/leads/export/lead-export-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.export");
  return { title: t("title") };
}

export default async function LeadExportPage({ params }: PageProps<"/leads/exports/[exportId]">) {
  const { exportId } = await params;
  return (
    <RequirePermission permission="leads:view">
      <LeadExportScreen exportId={exportId} />
    </RequirePermission>
  );
}
