// Renders a console screen as platform staff see it: the console's own data layer over the stubbed api
// (test/support/api-stub.ts), the app's words and toasts, and who is signed in; and reads back what the screen sent.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { ConsoleProviders } from "@/console/data/console-providers";
import { StaffProvider, type ConsoleStaff } from "@/console/session/staff-context";
import { locale, messages } from "@/i18n/messages";
import { platformStaff } from "../../support/platform-staff";

export function renderConsole(ui: ReactNode, staff: ConsoleStaff = platformStaff("super-admin")) {
  // Radix selects and dialogs ask for ResizeObserver, which jsdom lacks; nothing here depends on layout.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <ConsoleProviders>
        <StaffProvider staff={staff}>{ui}</StaffProvider>
      </ConsoleProviders>
      <Toaster />
    </NextIntlClientProvider>,
  );
}

/**
 * The inputs each call to a console procedure carried, in call order: a query's from its URL, a mutation's from its
 * body. `path` is the procedure's ("plans.create").
 */
export function inputsTo(path: string): unknown[] {
  const fetch = vi.mocked(globalThis.fetch);
  return fetch.mock.calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const prefix = "/api/platform/trpc/";
    if (!url.pathname.startsWith(prefix)) return [];
    const paths = decodeURIComponent(url.pathname.slice(prefix.length)).split(",");
    const body = typeof init?.body === "string" ? init.body : (url.searchParams.get("input") ?? "{}");
    const batch = JSON.parse(body) as Record<string, unknown>;
    return paths.flatMap((called, index) => (called === path ? [batch[String(index)]] : []));
  });
}
