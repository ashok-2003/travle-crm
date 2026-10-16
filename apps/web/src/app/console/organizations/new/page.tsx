// /console/organizations/new: onboarding an agency (spec 7.1), for platform staff of either level.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OnboardScreen } from "@/console/organizations/onboarding/onboard-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleOrganizations.onboard");
  return { title: t("title") };
}

export default function OnboardPage() {
  return <OnboardScreen />;
}
