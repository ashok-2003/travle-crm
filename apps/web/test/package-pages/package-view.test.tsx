// A package page's ways to reach the agency: Call dials the agency's contact phone and WhatsApp opens a chat with its
// main WhatsApp number (the api falls back to the contact phone when no number is connected), each shown when it's there.
import type { PublicPackage } from "@travel-crm/contracts/package-pages";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { PackageView } from "@/package-pages/package-view";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "packagePages.page") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));
// The header and the enquiry form are parts of their own (one a server part, one a client part with the api).
vi.mock("@/package-pages/agency-header", () => ({ AgencyHeader: () => null }));
vi.mock("@/package-pages/enquiry-section", () => ({ EnquirySection: () => null }));

const words = messages.packagePages.page;

function pageWith(agency: Pick<PublicPackage["agency"], "phone" | "whatsapp">): PublicPackage {
  return {
    agency: {
      name: "Agency",
      code: "agency",
      logoUrl: null,
      colour: null,
      about: "",
      instagramUrl: null,
      ...agency,
    },
    package: {
      slug: "trip",
      name: "Trip",
      summary: "Five days.",
      nights: null,
      destinationName: null,
      highlights: [],
      days: [],
      inclusions: "",
      exclusions: "",
      cancellationNotes: "",
      fromPricePaise: null,
      photos: [],
    },
    departures: [],
    form: { openedToken: "t", turnstileSiteKey: null, months: [], consentLine: "" },
  };
}

describe("PackageView", () => {
  it("dials the contact phone and opens WhatsApp on the main number", async () => {
    render(await PackageView({ page: pageWith({ phone: "+919820012345", whatsapp: "+919800000072" }) }));
    expect(screen.getByRole("link", { name: words.call })).toHaveAttribute("href", "tel:+919820012345");
    expect(screen.getByRole("link", { name: words.whatsapp })).toHaveAttribute("href", "https://wa.me/919800000072");
  });

  it("shows each way only when the agency has it", async () => {
    const { unmount } = render(await PackageView({ page: pageWith({ phone: null, whatsapp: "+919800000072" }) }));
    expect(screen.queryByRole("link", { name: words.call })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: words.whatsapp })).toBeVisible();
    unmount();
    render(await PackageView({ page: pageWith({ phone: "+919820012345", whatsapp: null }) }));
    expect(screen.getByRole("link", { name: words.call })).toBeVisible();
    expect(screen.queryByRole("link", { name: words.whatsapp })).not.toBeInTheDocument();
  });
});
