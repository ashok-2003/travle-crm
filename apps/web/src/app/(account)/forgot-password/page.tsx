// /forgot-password: a reset link by email (spec 6.2); staff without email ask their admin instead.
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { TextLink } from "@/account/text-link";
import { PageTitle } from "@/components/page-title";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("forgotPassword.title") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("account.forgotPassword");
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ForgotPasswordForm />
      <p className="text-label text-muted-foreground">{t("noEmail")}</p>
      <TextLink href={routes.signIn}>{t("backToSignIn")}</TextLink>
    </div>
  );
}
