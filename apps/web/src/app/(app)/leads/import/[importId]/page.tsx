// /leads/import/<importId>: one lead import at whichever step it is (spec 3.2), so leaving and coming back finds it
// where it was. Members who may add leads and give them to others only.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadImportScreen } from "@/leads/import/lead-import-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.import");
  return { title: t("title") };
}

export default async function LeadImportStepPage({ params }: PageProps<"/leads/import/[importId]">) {
  const { importId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <LeadImportScreen importId={importId} />
      </RequirePermission>
    </RequirePermission>
  );
}
