// /packages: the agency's ready trips, and New package (sales execution). For whoever sees quotes.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PackagesScreen } from "@/packages/packages-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("packages.list");
  return { title: t("title") };
}

export default function PackagesPage() {
  return (
    <RequirePermission permission="quotes:view">
      <PackagesScreen />
    </RequirePermission>
  );
}
