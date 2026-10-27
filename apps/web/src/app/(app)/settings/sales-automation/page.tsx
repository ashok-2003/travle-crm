// /settings/sales-automation: what the agency's sales do by themselves (sales execution): the first WhatsApp to a new
// lead, the follow-ups, the payment reminders, and what makes a lead hot.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SalesAutomationScreen } from "@/sales/sales-automation-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sales.settings");
  return { title: t("title") };
}

export default function SalesAutomationPage() {
  return (
    <RequirePermission permission="settings:manage">
      <SalesAutomationScreen />
    </RequirePermission>
  );
}
