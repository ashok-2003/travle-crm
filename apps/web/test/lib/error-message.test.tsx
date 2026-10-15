// The sentence for a failure: the reason's own message if it has one, else one for the status or for being offline.
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { useErrorMessage } from "@/lib/error-message";
import { refusal, unanswered } from "../support/api-errors";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const errorMessage = () => renderHook(() => useErrorMessage(), { wrapper }).result.current;

const failure = (status: number, code: string) => ({ ok: false, status, code, retryAfterSeconds: null }) as const;

describe("useErrorMessage", () => {
  it("uses the domain reason's message", () => {
    expect(errorMessage().apiError(refusal(409, "ROLE_IN_USE"))).toBe(messages.errors.reasons.ROLE_IN_USE);
  });

  it("falls back to the status, and to the network message when nothing answered", () => {
    const { apiError } = errorMessage();
    expect(apiError(refusal(403, "SOMETHING_NEW"))).toBe(messages.errors.forbidden);
    expect(apiError(refusal(500))).toBe(messages.errors.generic);
    expect(apiError(unanswered())).toBe(messages.errors.network);
  });

  it("explains sign-in failures by their code", () => {
    const { authError } = errorMessage();
    expect(authError(failure(401, "INVALID_EMAIL_OR_PASSWORD"))).toBe(messages.errors.auth.INVALID_EMAIL_OR_PASSWORD);
    expect(authError(failure(429, "TOO_MANY_REQUESTS"))).toBe(messages.errors.tooManyRequests);
  });

  it("gives Better Auth's lockout, two-factor and reset-address codes their own sentences", () => {
    const { authError } = errorMessage();
    const statusOnly = [messages.errors.tooManyRequests, messages.errors.invalid, messages.errors.forbidden];
    for (const [status, code] of [
      [429, "ACCOUNT_TEMPORARILY_LOCKED"],
      [400, "TOTP_ALREADY_ENABLED"],
      [403, "INVALID_REDIRECT_URL"],
    ] as const) {
      expect(statusOnly, code).not.toContain(authError(failure(status, code)));
    }
    expect(authError(failure(429, "ACCOUNT_TEMPORARILY_LOCKED"))).toMatch(/15 minutes/);
  });
});
