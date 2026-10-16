// /two-factor-setup: turning on two-factor sign-in with an authenticator app. With two-factor off (features.twoFactor),
// there is nothing to set up: home.
import { features } from "@travel-crm/contracts/features";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("twoFactorSetup.title") };
}

export default function TwoFactorSetupPage() {
  if (!features.twoFactor) redirect(routes.home);
  // The step reads ?next=, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <TwoFactorSetupScreen />
    </Suspense>
  );
}
