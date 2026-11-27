// /settings/plan: Plan & billing, for members whose role holds billing:view (the Owner). It has its own entry in
// the settings list, because /settings itself needs settings:manage.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlanScreen } from "@/settings/plan/plan-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("planBilling");
  return { title: t("title") };
}

export default function PlanPage() {
  return (
    <RequirePermission permission="billing:view">
      <PlanScreen />
    </RequirePermission>
  );
}
