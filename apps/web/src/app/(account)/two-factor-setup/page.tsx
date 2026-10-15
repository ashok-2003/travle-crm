// /two-factor-setup: turning on two-factor sign-in with an authenticator app.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("twoFactorSetup.title") };
}

export default function TwoFactorSetupPage() {
  return <TwoFactorSetupScreen />;
}
