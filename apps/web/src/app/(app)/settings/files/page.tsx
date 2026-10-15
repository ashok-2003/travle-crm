// /settings/files: the agency's own papers, for members whose role may change settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BusinessFilesScreen } from "@/business/files/business-files-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("business");
  return { title: t("files.title") };
}

export default function BusinessFilesPage() {
  return (
    <RequirePermission permission="settings:manage">
      <BusinessFilesScreen />
    </RequirePermission>
  );
}
