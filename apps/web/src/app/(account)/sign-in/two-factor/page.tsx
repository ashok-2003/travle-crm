// /sign-in/two-factor: the code after the password, for people with two-factor sign-in. With two-factor off
// (features.twoFactor), no sign-in asks for one: the sign-in page.
import { features } from "@travel-crm/contracts/features";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("twoFactor.title") };
}

export default function TwoFactorPage() {
  if (!features.twoFactor) redirect(routes.signIn);
  // The step reads ?next=, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <TwoFactorChallenge />
    </Suspense>
  );
}
