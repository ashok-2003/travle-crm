// /settings/lead-sources: the Google Sheets whose new rows become leads by themselves, for roles that may add leads and
// give them out (spec 6.5, S1).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadSourcesScreen } from "@/lead-sources/lead-sources-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sheets");
  return { title: t("list.title") };
}

export default function LeadSourcesPage() {
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <LeadSourcesScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
