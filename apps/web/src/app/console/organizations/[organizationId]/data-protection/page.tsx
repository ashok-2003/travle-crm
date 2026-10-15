// /console/organizations/<id>/data-protection: an organization's exports and its permanent deletion, or one person's
// or record's, a super admin's alone (spec 5).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DataProtectionScreen } from "@/console/data-protection/data-protection-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.dataProtection");
  return { title: t("title") };
}

export default async function DataProtectionPage({
  params,
}: PageProps<"/console/organizations/[organizationId]/data-protection">) {
  const { organizationId } = await params;
  return <DataProtectionScreen organizationId={organizationId} />;
}
