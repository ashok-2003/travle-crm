// The public page's parts: one h1 with the ways to sales and in; every lead source saying whether it works today;
// sales and the tech team each reachable by call, WhatsApp and email at the brand's numbers; the legal pages and the
// way in at the foot; and the header's links to each part.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { ContactSection } from "@/marketing/contact-section";
import { Hero } from "@/marketing/hero";
import { MarketingFooter } from "@/marketing/marketing-footer";
import { MarketingHeader, marketingSections } from "@/marketing/marketing-header";
import { SourcesSection } from "@/marketing/sources-section";

const { marketing } = messages;

const renderPart = (part: ReactElement) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {part}
    </NextIntlClientProvider>,
  );

describe("the public page", () => {
  it("opens with its one h1, sales on WhatsApp and the way in", () => {
    renderPart(<Hero />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: marketing.hero.talkToSales })).toHaveAttribute(
      "href",
      "https://wa.me/918447085431",
    );
    expect(screen.getByRole("link", { name: marketing.hero.signIn })).toHaveAttribute("href", "/sign-in");
  });

  it("says which lead sources work today and which are coming", () => {
    renderPart(<SourcesSection />);
    const sheets = screen.getByText(marketing.sources.items.sheets.name).closest<HTMLElement>("[data-slot=item]");
    const whatsapp = screen.getByText(marketing.sources.items.whatsapp.name).closest<HTMLElement>("[data-slot=item]");
    if (!sheets || !whatsapp) throw new Error("a source is missing");
    expect(within(sheets).getByText(marketing.status.live)).toBeVisible();
    expect(within(whatsapp).getByText(marketing.status.soon)).toBeVisible();
  });

  it.each([
    ["sales", "+91 84470 85431", "918447085431", "aayushh.mishra2003@gmail.com"],
    ["tech", "+91 85389 53742", "918538953742", "workatashok@gmail.com"],
  ] as const)("reaches %s by call, WhatsApp and email", (team, phone, digits, email) => {
    renderPart(<ContactSection />);
    const card = screen.getByText(marketing.contact[team].title).closest<HTMLElement>("[data-slot=card]");
    if (!card) throw new Error(`no card for ${team}`);
    const links = within(card);
    expect(links.getByRole("link", { name: `Call ${phone}` })).toHaveAttribute("href", `tel:+${digits}`);
    expect(links.getByRole("link", { name: `WhatsApp ${phone}` })).toHaveAttribute("href", `https://wa.me/${digits}`);
    expect(links.getByRole("link", { name: `Email ${email}` })).toHaveAttribute("href", `mailto:${email}`);
  });

  it("links each part from the header, and signs in from it", () => {
    renderPart(<MarketingHeader />);
    const sections = within(screen.getByRole("navigation", { name: marketing.nav.label }));
    expect(sections.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      marketingSections.map((section) => `#${section}`),
    );
    expect(screen.getByRole("link", { name: marketing.nav.signIn })).toHaveAttribute("href", "/sign-in");
  });

  it("leads to the legal pages and the way in from the foot", () => {
    renderPart(<MarketingFooter />);
    expect(screen.getByRole("link", { name: marketing.footer.privacy })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: marketing.footer.terms })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: marketing.footer.signIn })).toHaveAttribute("href", "/sign-in");
  });
});
