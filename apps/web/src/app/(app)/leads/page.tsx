// /leads: the lead list (spec 3.3), for members whose role sees leads (their own or everyone's).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LeadsScreen } from "@/leads/list/leads-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.list");
  return { title: t("title") };
}

export default function LeadsPage() {
  return (
    <RequirePermission permission="leads:view">
      {/* The filters are in the address, which only the browser knows. */}
      <Suspense>
        <LeadsScreen />
      </Suspense>
    </RequirePermission>
  );
}
