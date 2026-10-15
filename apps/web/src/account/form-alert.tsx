"use client";

// Why a form was refused, above its button: the api's reason in plain words, or how long to wait after too many tries.
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthResult } from "@/data/auth-client";
import { useErrorMessage } from "@/lib/error-message";

export type AuthFailure = Extract<AuthResult<unknown>, { ok: false }>;

export function AuthFailureAlert({ failure }: { failure: AuthFailure | null }) {
  const t = useTranslations("account.signIn");
  const { authError } = useErrorMessage();
  if (!failure) return null;
  const message =
    failure.status === 429 && failure.retryAfterSeconds !== null
      ? t("waitSeconds", { seconds: failure.retryAfterSeconds })
      : authError(failure);
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
