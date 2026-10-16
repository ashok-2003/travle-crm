// /change-password: replacing a temporary password at first sign-in, or changing one's own.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSkeleton } from "@/account/account-skeleton";
import { ChangePasswordScreen } from "@/account/change-password-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("changePassword.title") };
}

export default function ChangePasswordPage() {
  // The step reads ?next=, which is only known in the browser.
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <ChangePasswordScreen />
    </Suspense>
  );
}
