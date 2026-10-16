"use client";

// The sentence a person reads when something they did was refused or failed: the domain reason's own message when
// there is one (spec 9.7), Better Auth's code's for its calls, otherwise one for the HTTP status, or for not reaching
// the server at all.
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { refusalOf } from "@/data/api-error";
import type { AuthResult } from "@/data/auth-client";
import errors from "@/i18n/messages/en-IN/errors.json";

type Reason = keyof typeof errors.reasons;
type AuthCode = keyof typeof errors.auth;

const isReason = (value: string | null): value is Reason => value !== null && Object.hasOwn(errors.reasons, value);
const isAuthCode = (value: string): value is AuthCode => Object.hasOwn(errors.auth, value);

type Failure = Extract<AuthResult<unknown>, { ok: false }>;

export function useErrorMessage() {
  const t = useTranslations("errors");

  const forStatus = useCallback(
    (status: number): string => {
      if (status === 0) return t("network");
      if (status === 401) return t("signedOut");
      if (status === 403) return t("forbidden");
      if (status === 404) return t("notFound");
      if (status === 429) return t("tooManyRequests");
      if (status === 400) return t("invalid");
      return t("generic");
    },
    [t],
  );

  /** For a failed tRPC call. */
  const apiError = useCallback(
    (error: unknown): string => {
      const refusal = refusalOf(error);
      if (!refusal) return t("network");
      return isReason(refusal.reason) ? t(`reasons.${refusal.reason}`) : forStatus(refusal.status);
    },
    [t, forStatus],
  );

  /**
   * For a failed sign-in, password, two-factor or impersonation call: Better Auth's code, else a reason of ours (the
   * side door's refusals of Better Auth's calls), else the status.
   */
  const authError = useCallback(
    (failure: Failure): string => {
      if (isAuthCode(failure.code)) return t(`auth.${failure.code}`);
      return isReason(failure.code) ? t(`reasons.${failure.code}`) : forStatus(failure.status);
    },
    [t, forStatus],
  );

  return { apiError, authError };
}
