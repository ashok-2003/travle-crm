// /leads/<id>: one lead (spec 3.4), for members whose role sees leads; one out of their scope is "not found".
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.lead");
  return { title: t("title") };
}

export default async function LeadPage({ params }: PageProps<"/leads/[leadId]">) {
  const { leadId } = await params;
  return (
    <RequirePermission permission="leads:view">
      {/* The way back keeps the list's filters, from the address, which only the browser knows. */}
      <Suspense>
        <LeadScreen leadId={leadId} />
      </Suspense>
    </RequirePermission>
  );
}
