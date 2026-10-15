// /change-password: replacing a temporary password at first sign-in, or changing one's own.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangePasswordScreen } from "@/account/change-password-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("changePassword.title") };
}

export default function ChangePasswordPage() {
  return <ChangePasswordScreen />;
}
