// /packages/<id>: one package, its tiers, photos and public page (release 7b).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PackageScreen } from "@/packages/package-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("packages.page");
  return { title: t("title") };
}

export default async function PackagePage({ params }: PageProps<"/packages/[packageId]">) {
  const { packageId } = await params;
  return (
    <RequirePermission permission="quotes:edit">
      <PackageScreen packageId={packageId} />
    </RequirePermission>
  );
}
