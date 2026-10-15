// Renders an organization screen's parts as a signed-in member sees them: with the app's messages, the member, and a
// phone-sized or wide screen.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";

/** jsdom has no matchMedia: answer every query as a screen of the given width would. */
export function screenIs(width: "phone" | "wide"): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: width === "wide", addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

export function renderAs(ui: ReactNode, me: SignedInMember = member({ isOwner: true })) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <MeProvider me={me}>{ui}</MeProvider>
    </NextIntlClientProvider>,
  );
}
