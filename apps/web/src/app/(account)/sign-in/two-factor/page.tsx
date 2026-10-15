// /sign-in/two-factor: the code after the password, for people with two-factor sign-in.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("twoFactor.title") };
}

export default function TwoFactorPage() {
  // The step reads ?next=, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <TwoFactorChallenge />
    </Suspense>
  );
}
