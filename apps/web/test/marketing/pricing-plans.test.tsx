// The plans as the public page prices them: before GST in rupees, monthly until the visitor picks yearly, a plan not
// sold that way saying how it is sold, what each includes in plain names, and the way to talk to sales.
import type { PublicPlan } from "@travel-crm/contracts/subscriptions";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { PricingPlans } from "@/marketing/pricing-plans";

const { pricing } = messages.marketing;

const plans: PublicPlan[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPricePaise: 199_900,
    yearlyPricePaise: 1_999_000,
    extraSeatMonthlyPricePaise: 29_900,
    extraSeatYearlyPricePaise: null,
    seatLimit: 3,
    whatsappNumberLimit: 1,
    storageLimitBytes: 5_000_000_000,
    modules: ["crm", "inbox"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPricePaise: null,
    yearlyPricePaise: 12_00_000_00,
    extraSeatMonthlyPricePaise: null,
    extraSeatYearlyPricePaise: null,
    seatLimit: 100,
    whatsappNumberLimit: 5,
    storageLimitBytes: 100_000_000_000,
    modules: ["crm"],
  },
];

function renderPlans() {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PricingPlans plans={plans} />
    </NextIntlClientProvider>,
  );
  const card = (name: string) => {
    const title = screen.getByText(name);
    const found = title.closest<HTMLElement>("[data-slot=card]");
    if (!found) throw new Error(`no card for ${name}`);
    return within(found);
  };
  return { starter: () => card("Starter"), enterprise: () => card("Enterprise") };
}

describe("PricingPlans", () => {
  it("prices each plan monthly at first, before GST, with what it holds", () => {
    const { starter, enterprise } = renderPlans();
    expect(starter().getByText("₹1,999")).toBeVisible();
    expect(starter().getByText(pricing.perMonth)).toBeVisible();
    expect(starter().getByText("3 staff seats")).toBeVisible();
    expect(starter().getByText("More seats at ₹299 each")).toBeVisible();
    expect(starter().getByText("1 WhatsApp number")).toBeVisible();
    expect(starter().getByText("5 GB for files")).toBeVisible();
    expect(starter().getByText(pricing.modules.crm)).toBeVisible();
    expect(starter().getByText(pricing.modules.inbox)).toBeVisible();
    // Sold only yearly: it says so rather than showing a price it doesn't have.
    expect(enterprise().getByText(pricing.notSoldMonthly)).toBeVisible();
  });

  it("shows the yearly prices once picked, in lakhs as Indians group them", async () => {
    const { starter, enterprise } = renderPlans();
    await userEvent.click(screen.getByRole("radio", { name: pricing.yearly }));
    expect(starter().getByText("₹19,990")).toBeVisible();
    expect(starter().getByText(pricing.perYear)).toBeVisible();
    // No yearly price for an extra seat: not offered that way.
    expect(starter().queryByText(/More seats/)).toBeNull();
    expect(enterprise().getByText("₹12,00,000")).toBeVisible();
  });

  it("leads each plan to sales on WhatsApp", () => {
    const { starter } = renderPlans();
    expect(starter().getByRole("link", { name: pricing.choose })).toHaveAttribute("href", "https://wa.me/918447085431");
  });
});
