// /two-factor-setup: turning on two-factor sign-in with an authenticator app.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("twoFactorSetup.title") };
}

export default function TwoFactorSetupPage() {
  // The step reads ?next=, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <TwoFactorSetupScreen />
    </Suspense>
  );
}
