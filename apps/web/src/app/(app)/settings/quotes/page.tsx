// /settings/quotes: how the agency's quotes are paid (its UPI id) and taxed, and the terms under them (step 3, P0).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuoteSettingsScreen } from "@/quotes/quote-settings-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes.settings");
  return { title: t("title") };
}

export default function QuoteSettingsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <QuoteSettingsScreen />
    </RequirePermission>
  );
}
