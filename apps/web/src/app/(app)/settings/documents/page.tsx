// /settings/documents: the documents the organization has issued, with their PDFs, for roles that may change settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsScreen } from "@/documents/documents-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents.list");
  return { title: t("title") };
}

export default function DocumentsPage() {
  return (
    <RequirePermission permission="settings:manage">
      <DocumentsScreen />
    </RequirePermission>
  );
}
