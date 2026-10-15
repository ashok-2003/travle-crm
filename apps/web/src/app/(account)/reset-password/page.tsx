// /reset-password: where the emailed reset link leads, with ?token= or ?error=INVALID_TOKEN.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { ResetPasswordScreen } from "@/account/reset-password-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("resetPassword.title") };
}

export default function ResetPasswordPage() {
  // The screen reads the token, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
