"use client";

// /reset-password: reads the token (or the error) Better Auth put in the address.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { ResetPasswordForm } from "./reset-password-form";

export function ResetPasswordScreen() {
  const t = useTranslations("account.resetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("error") === null ? searchParams.get("token") : null;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <ResetPasswordForm token={token} />
    </div>
  );
}
