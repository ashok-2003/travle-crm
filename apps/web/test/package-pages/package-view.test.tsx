// A package page's ways to reach the agency: Call dials the agency's contact phone and WhatsApp opens a chat with its
// main WhatsApp number (the api falls back to the contact phone when no number is connected), each shown when it's there.
// An older api's answer (the release window) has no number: it still parses, and WhatsApp opens the contact phone.
import { publicPackageAnswer, type PublicPackage } from "@travel-crm/contracts/package-pages";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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

async function renderView(page: PublicPackage) {
  const view = await PackageView({ page });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {view}
    </NextIntlClientProvider>,
  );
}

function pageWith(
  agency: Pick<PublicPackage["agency"], "phone" | "whatsapp">,
  trip: Partial<PublicPackage["package"]> = {},
  departures: PublicPackage["departures"] = [],
): PublicPackage {
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
      ...trip,
    },
    departures,
    form: { openedToken: "t", turnstileSiteKey: null, months: [], consentLine: "" },
  };
}

describe("PackageView", () => {
  it("dials the contact phone and opens WhatsApp on the main number", async () => {
    await renderView(pageWith({ phone: "+919820012345", whatsapp: "+919800000072" }));
    expect(screen.getByRole("link", { name: words.call })).toHaveAttribute("href", "tel:+919820012345");
    expect(screen.getByRole("link", { name: words.whatsapp })).toHaveAttribute("href", "https://wa.me/919800000072");
  });

  it("shows each way only when the agency has it", async () => {
    const { unmount } = await renderView(pageWith({ phone: null, whatsapp: "+919800000072" }));
    expect(screen.queryByRole("link", { name: words.call })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: words.whatsapp })).toBeVisible();
    unmount();
    await renderView(pageWith({ phone: null, whatsapp: null }));
    expect(screen.queryByRole("link", { name: words.call })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: words.whatsapp })).not.toBeInTheDocument();
  });

  it("parses an older api's answer, which has no WhatsApp number, and opens WhatsApp on the contact phone", async () => {
    const page = pageWith({ phone: "+919820012345", whatsapp: null });
    const olderAgency: Record<string, unknown> = { ...page.agency };
    delete olderAgency.whatsapp;
    const answer = publicPackageAnswer.safeParse(
      JSON.parse(JSON.stringify({ available: true, page: { ...page, agency: olderAgency } })),
    );
    expect(answer.success).toBe(true);
    if (!answer.success || !answer.data.available) throw new Error("the older answer did not parse");
    await renderView(answer.data.page);
    expect(screen.getByRole("link", { name: words.whatsapp })).toHaveAttribute("href", "https://wa.me/919820012345");
  });

  it("reads in order: the trip's name, nights and price, the next dates in words, then the plan as boxes and points", async () => {
    const departure = (id: string, startDate: string, word: "open" | "filling" | "full") => ({
      id,
      startDate,
      endDate: startDate,
      pricePaise: null,
      word,
    });
    await renderView(
      pageWith(
        { phone: null, whatsapp: "+919800000072" },
        {
          name: "Kedarnath yatra",
          nights: 5,
          fromPricePaise: 3200000,
          highlights: ["Darshan"],
          days: [{ title: "Arrive", description: "Meet at Haridwar" }],
          inclusions: "Hotels\nBreakfast",
          exclusions: "Flights",
          cancellationNotes: "Free to cancel 30 days before.",
        },
        [departure("d1", "2027-10-16", "open"), departure("d2", "2027-10-23", "full")],
      ),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Kedarnath yatra" })).toBeVisible();
    expect(screen.getByText("5 nights")).toBeVisible();
    expect(screen.getByText(/32,000/)).toBeVisible();
    const next = screen.getByText(words.nextDepartures);
    expect(next.parentElement).toHaveTextContent(words.words.open);
    expect(next.parentElement).toHaveTextContent(words.words.full);
    expect(next.parentElement).not.toHaveTextContent(/seat/i);
    expect(screen.getByRole("link", { name: words.askAbout })).toHaveAttribute("href", "#enquire");
    expect(screen.getByText("Day 1 · Arrive")).toBeVisible();
    const included = screen.getByRole("heading", { name: words.inclusions }).parentElement;
    expect(included?.querySelectorAll('[data-mark="tick"]')).toHaveLength(2);
    const excluded = screen.getByRole("heading", { name: words.exclusions }).parentElement;
    expect(excluded?.querySelectorAll('[data-mark="cross"]')).toHaveLength(1);
    expect(screen.getByText("Free to cancel 30 days before.")).toBeVisible();
    const order = [
      "Kedarnath yatra",
      "Darshan",
      "Day 1 · Arrive",
      "Hotels",
      "Flights",
      "Free to cancel 30 days before.",
    ];
    const text = document.body.textContent;
    const positions = order.map((part) => text.indexOf(part));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows no next-departures line when there are no dates", async () => {
    await renderView(pageWith({ phone: null, whatsapp: null }));
    expect(screen.queryByText(words.nextDepartures)).not.toBeInTheDocument();
  });
});
