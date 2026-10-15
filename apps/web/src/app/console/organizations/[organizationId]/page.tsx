// /console/organizations/<id>: one organization in the console. ?onboarded=1, which onboarding adds, has the page say
// the Owner's invite is on its way; the server reads only that flag and the id, never the organization's data.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrganizationScreen } from "@/console/organizations/organization/organization-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleOrganizations.organization");
  return { title: t("title") };
}

export default async function OrganizationPage({
  params,
  searchParams,
}: PageProps<"/console/organizations/[organizationId]">) {
  const { organizationId } = await params;
  const { onboarded } = await searchParams;
  return <OrganizationScreen organizationId={organizationId} onboarded={onboarded === "1"} />;
}
