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

describe("useErrorMessage", () => {
  const { result } = renderHook(() => useErrorMessage(), { wrapper });

  it("uses the domain reason's message", () => {
    expect(result.current.apiError(refusal(409, "ROLE_IN_USE"))).toBe(messages.errors.reasons.ROLE_IN_USE);
  });

  it("falls back to the status, and to the network message when nothing answered", () => {
    expect(result.current.apiError(refusal(403, "SOMETHING_NEW"))).toBe(messages.errors.forbidden);
    expect(result.current.apiError(refusal(500))).toBe(messages.errors.generic);
    expect(result.current.apiError(unanswered())).toBe(messages.errors.network);
  });

  it("explains sign-in failures by their code", () => {
    const wrongPassword = {
      ok: false,
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      retryAfterSeconds: null,
    } as const;
    expect(result.current.authError(wrongPassword)).toBe(messages.errors.auth.INVALID_EMAIL_OR_PASSWORD);
    expect(result.current.authError({ ...wrongPassword, status: 429, code: "TOO_MANY_REQUESTS" })).toBe(
      messages.errors.tooManyRequests,
    );
  });
});
