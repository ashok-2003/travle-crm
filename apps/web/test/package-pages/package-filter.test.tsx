// The all-packages list's cards: a priced trip reads "From ₹12,500 per person" (never the message's raw key) and an
// unpriced one "Price on enquiry".
import type { PublicPackageList } from "@travel-crm/contracts/package-pages";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { PackageFilter } from "@/package-pages/package-filter";

const card = { summary: "Five days.", nights: 4, destinationId: null, destinationName: null, photoUrl: null };
const list: PublicPackageList = {
  agency: {
    name: "Agency",
    code: "agency",
    logoUrl: null,
    colour: null,
    about: "",
    instagramUrl: null,
    phone: null,
    whatsapp: null,
  },
  packages: [
    { ...card, slug: "manali", name: "Manali", fromPricePaise: 1_250_000 },
    { ...card, slug: "spiti", name: "Spiti", fromPricePaise: null },
  ],
  destinations: [],
};

describe("PackageFilter", () => {
  it("shows each card's price from, in words", () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PackageFilter list={list} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("₹12,500", { selector: ".numbers" }).parentElement).toHaveTextContent(
      "From ₹12,500 per person",
    );
    expect(screen.getByText(messages.packagePages.page.onEnquiry)).toBeVisible();
  });
});
