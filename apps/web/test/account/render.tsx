// Renders an account screen as the app does: with its messages, a query cache of its own and the tRPC client (which
// these tests never let call the api).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { AuthResult } from "@/data/auth-client";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";

// jsdom has no layout: the one-time-code input asks for ResizeObserver and elementFromPoint (password managers'
// badges); neither matters here.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  },
);
Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true });

export function renderScreen(screen: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          {screen}
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** An auth call that answers once with result. */
export function answers<T>(result: AuthResult<T>) {
  return vi.fn(() => Promise.resolve(result));
}

export const ok = <T,>(data: T): AuthResult<T> => ({ ok: true, data });

export const refused = (status: number, code: string, retryAfterSeconds: number | null = null): AuthResult<never> => ({
  ok: false,
  status,
  code,
  retryAfterSeconds,
});
