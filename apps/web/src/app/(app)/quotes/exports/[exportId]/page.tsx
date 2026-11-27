// /quotes/exports/<id>: a quotes export's page (bookings revamp, 2026-11-27), where the bell's "Your quotes export
// is ready" leads, for members whose role sees quotes. It is an export (ADR 0021): a read-only agency still downloads
// from it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuoteExportScreen } from "@/quotes/export/quote-export-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes.export");
  return { title: t("title") };
}

export default async function QuoteExportPage({ params }: PageProps<"/quotes/exports/[exportId]">) {
  const { exportId } = await params;
  return (
    <RequirePermission permission="quotes:view">
      <QuoteExportScreen exportId={exportId} />
    </RequirePermission>
  );
}
