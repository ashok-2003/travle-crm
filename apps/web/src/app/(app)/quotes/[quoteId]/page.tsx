// /quotes/<id>: one quote, its plan, price and money (step 3, P0); one out of the member's scope is "not found".
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuoteScreen } from "@/quotes/quote-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes.quote");
  return { title: t("title") };
}

export default async function QuotePage({ params }: PageProps<"/quotes/[quoteId]">) {
  const { quoteId } = await params;
  return (
    <RequirePermission permission="quotes:view">
      <QuoteScreen quoteId={quoteId} />
    </RequirePermission>
  );
}
