// Renders the visitor's form as a visitor sees it: the app's messages and nothing else (no member, no api, no cache).
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { locale } from "@/i18n/messages";
import { formMessages } from "@/website-form/form-messages";

export function renderForm(ui: ReactNode) {
  // Radix's Select asks the pointer questions jsdom does not answer.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
  }
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={formMessages}
      timeZone="Asia/Kolkata"
      // The pages carry only formMessages: a word outside it must fail here, not on a visitor's screen.
      onError={(error) => {
        throw error;
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

export const kashmirId = "0197f3a4-0000-7000-8000-000000000001";

/** A form with every optional field on and the offers tickbox off; each test changes what it is about. */
export function publicFormOf(changes: Partial<PublicForm> = {}): PublicForm {
  return {
    organizationName: "Sharma Travels",
    logoUrl: null,
    colour: null,
    heading: "Plan your trip with Sharma Travels",
    introduction: "Tell us where you want to go.",
    thankYouMessage: "Thank you. We will call you soon.",
    websiteUrl: "https://sharma.example",
    websiteButtonText: "Back to our website",
    privacyUrl: null,
    fields: {
      email: "optional",
      destination: "optional",
      travelMonth: "optional",
      travellers: "optional",
      budget: "optional",
      message: "optional",
    },
    destinationInput: "list",
    offersTickbox: false,
    offersWording: null,
    destinations: [{ id: kashmirId, name: "Kashmir" }],
    months: ["2026-11", "2026-12", "2027-01"],
    openedToken: "opened.token",
    turnstileSiteKey: null,
    ...changes,
  };
}
