// /leads/new: the new-lead form (spec 3.2), a page of its own (R40), for members whose role may add leads.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewLeadScreen } from "@/leads/form/new-lead-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.form");
  return { title: t("title") };
}

export default function NewLeadPage() {
  return (
    <RequirePermission permission="leads:create">
      <NewLeadScreen />
    </RequirePermission>
  );
}
