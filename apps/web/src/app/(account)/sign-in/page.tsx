// /sign-in: by email, or by organization code and username (spec 6.3).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { SignInScreen } from "@/account/sign-in-screen";
import { WakeOnOpen } from "@/account/wake-on-open";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("signIn.title") };
}

export default function SignInPage() {
  // The screen reads ?next=, which is only known in the browser; until then the prerendered page shows a skeleton.
  return (
    <>
      <WakeOnOpen />
      <Suspense fallback={<AccountSkeleton />}>
        <SignInScreen />
      </Suspense>
    </>
  );
}
