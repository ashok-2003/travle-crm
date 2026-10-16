// /forgot-password: a reset link by email (spec 6.2); staff without email ask their admin instead.
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { TextLink } from "@/components/text-link";
import { PageHeader } from "@/components/page-header";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("forgotPassword.title") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("account.forgotPassword");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <ForgotPasswordForm />
      <p className="text-label text-muted-foreground">{t("noEmail")}</p>
      <TextLink href={routes.signIn}>{t("backToSignIn")}</TextLink>
    </div>
  );
}
