// /forgot-password: a reset link by email (spec 6.2); staff without email ask their admin instead.
import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { PageTitle } from "@/components/page-title";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const t = useTranslations("account.forgotPassword");
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ForgotPasswordForm />
      <p className="text-label text-muted-foreground">{t("noEmail")}</p>
      <Link href={routes.signIn} className="text-primary underline-offset-4 hover:underline">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
