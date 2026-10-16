// Renders a console screen as platform staff see it: the app's messages, the console's own data layer (answered by
// the stubbed api, support/api-stub.ts) and who is signed in; reads back what the screen sent to a procedure; and
// gives jsdom the few browser methods Radix's selects and dialogs call.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ConsoleProviders } from "@/console/data/console-providers";
import { StaffProvider, type ConsoleStaff } from "@/console/session/staff-context";
import { locale, messages } from "@/i18n/messages";
import { platformStaff } from "../../support/platform-staff";

export function renderConsoleScreen(ui: ReactNode, staff: ConsoleStaff = platformStaff()) {
  // Stubbed per render because tests unstub their globals after each test; nothing here depends on layout.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <ConsoleProviders>
        <StaffProvider staff={staff}>{ui}</StaffProvider>
      </ConsoleProviders>
    </NextIntlClientProvider>,
  );
}

const CONSOLE_TRPC = "/api/platform/trpc/";

/**
 * The inputs sent to one console procedure ("organizations.onboard"), in call order, from the stubbed fetch: a query's
 * from its address, a mutation's from its body.
 */
export function inputsSentTo(procedure: string): unknown[] {
  const sent: unknown[] = [];
  for (const [input, init] of vi.mocked(globalThis.fetch).mock.calls) {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    if (!url.pathname.startsWith(CONSOLE_TRPC)) continue;
    const paths = decodeURIComponent(url.pathname.slice(CONSOLE_TRPC.length)).split(",");
    const body = typeof init?.body === "string" ? init.body : (url.searchParams.get("input") ?? "{}");
    const batch = JSON.parse(body) as Record<string, unknown>;
    paths.forEach((path, index) => {
      if (path === procedure) sent.push(batch[String(index)]);
    });
  }
  return sent;
}
