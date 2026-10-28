// /console/usage/<id>: how one organization uses the product; the server reads only the id.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrganizationUsageScreen } from "@/console/growth/organization-usage-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleGrowth.organization");
  return { title: t("title") };
}

export default async function OrganizationUsagePage({ params }: PageProps<"/console/usage/[organizationId]">) {
  const { organizationId } = await params;
  return <OrganizationUsageScreen organizationId={organizationId} />;
}
