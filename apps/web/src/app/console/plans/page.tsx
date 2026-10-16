// /console/plans: the plans organizations are put on, and the subscription policy (spec 7.2, 7.3).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlansScreen } from "@/console/plans/plans-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.plans");
  return { title: t("title") };
}

export default function ConsolePlansPage() {
  return <PlansScreen />;
}
