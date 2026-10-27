// /quotes: the member's quotes, or the agency's for a role that sees them all (step 3, P0).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuotesScreen } from "@/quotes/quotes-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes.list");
  return { title: t("title") };
}

export default function QuotesPage() {
  return (
    <RequirePermission permission="quotes:view">
      <QuotesScreen />
    </RequirePermission>
  );
}
