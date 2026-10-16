// How a shut organization reaches support: the brand's email always, and its phone, as Indians write it, only once
// the owner has given one (a phone that isn't set is no row at all, never zeros).
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type * as Brand from "@travel-crm/brand";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { SupportContacts } from "@/subscription/support-contacts";

const brandPhone = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@travel-crm/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof Brand>();
  return {
    ...actual,
    brand: new Proxy(actual.brand, {
      get: (target, key, receiver) =>
        key === "supportPhone" ? brandPhone.value : (Reflect.get(target, key, receiver) as unknown),
    }),
  };
});

function renderContacts() {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SupportContacts />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  brandPhone.value = null;
});

describe("SupportContacts", () => {
  it("offers the phone, as Indians write it, once the brand has one", () => {
    brandPhone.value = "+919876543210";
    renderContacts();
    expect(screen.getByRole("link", { name: "+91 98765 43210" })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("leaves the phone out while the brand has none, and keeps the email", () => {
    renderContacts();
    expect(screen.queryByRole("link", { name: /^\+91/ })).toBeNull();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /@/ })).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
  });
});
