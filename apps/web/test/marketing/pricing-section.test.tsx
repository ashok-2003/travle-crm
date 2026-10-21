// The public page's prices: the plans on sale once the api gives them, and the way to ask sales when it has none on
// sale, never an empty grid.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { PricingSection } from "@/marketing/pricing-section";

const { pricing } = messages.marketing;

const starter = {
  key: "starter",
  name: "Starter",
  monthlyPricePaise: 199_900,
  yearlyPricePaise: null,
  extraSeatMonthlyPricePaise: null,
  extraSeatYearlyPricePaise: null,
  seatLimit: 3,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000,
  modules: ["crm"],
};

function renderPricing(plans: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(plans))),
  );
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={new QueryClient()}>
        <PricingSection />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PricingSection", () => {
  it("prices the plans on sale", async () => {
    renderPricing([starter]);
    expect(await screen.findByText("Starter")).toBeVisible();
    expect(screen.getByText("₹1,999")).toBeVisible();
  });

  it("offers sales instead when no plan is on sale", async () => {
    renderPricing([]);
    expect(await screen.findByText(pricing.unavailable)).toBeVisible();
    expect(screen.getByRole("link", { name: pricing.choose })).toHaveAttribute("href", "https://wa.me/918447085431");
  });
});
