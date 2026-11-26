// The opened quote read at a glance: its trip big, its price before its plan, the plan as boxes, points that are
// ticked and crossed, payments in the colours people read, a green departure, and the "sent, so fixed" note last.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { QuoteScreen } from "@/quotes/quote-screen";
import { renderScreen } from "../leads/screen";
import { aPackage } from "../packages/detail";
import { stubApi } from "../support/api-stub";
import { aQuote } from "./quote";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const words = messages.quotes;
const open = async (changes: Parameters<typeof aQuote>[0], extra: Record<string, unknown> = {}) => {
  stubApi({
    "quotes.get": { data: aQuote(changes) },
    "departures.get": { data: { seatsTotal: 20, free: 7, templateId: "0190a000-0000-7000-8000-000000000001" } },
    "packages.get": { data: aPackage({ pickupPoints: "Delhi ISBT Kashmere Gate, 6 pm\nChandigarh, 11 pm" }) },
    ...extra,
  });
  renderScreen(<QuoteScreen quoteId="0199a000-0000-7000-8000-0000000000a1" />, { width: "wide" });
  return screen.findByRole("heading", { level: 1 });
};
const money = (paid: number, balance: number) => ({
  subtotalPaise: 5_000_000,
  taxPaise: 250_000,
  totalPaise: 5_250_000,
  paidPaise: paid,
  balancePaise: balance,
});
const figure = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;
const inOrder = (...elements: Element[]) => {
  for (const [index, element] of elements.slice(1).entries()) {
    const before = elements.at(index);
    expect(before && position(before, element)).toBeTruthy();
  }
};
const position = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;

describe("an opened sent quote", () => {
  it("makes the trip's name the page's heading, with its date and people in ink", async () => {
    const heading = await open({ adults: 1 });
    expect(heading).toHaveTextContent("Manali 5 days");
    const line = await screen.findByText(/Fri 4 Dec · 1 adult/);
    expect(line.className).not.toMatch(/muted/);
    expect(line.closest("[class*=muted]")).toBeNull();
  });

  it("puts Price before Day by day, each day in a box with an arrow between", async () => {
    await open({
      days: [
        { title: "Delhi to Manali", description: "Overnight Volvo." },
        { title: "Manali", description: "Rohtang." },
      ],
    });
    const price = await screen.findByRole("heading", { name: words.form.price });
    const days = screen.getByRole("heading", { name: words.form.days });
    expect(position(price, days)).toBeTruthy();
    expect(screen.getByText("Day 1 · Delhi to Manali")).toBeTruthy();
    expect(screen.getByText("Day 2 · Manali")).toBeTruthy();
    expect(document.querySelectorAll("[data-slot=day-arrow]")).toHaveLength(1);
  });

  it("lists inclusions with ticks, exclusions with crosses and notes as points", async () => {
    await open({ inclusions: "Breakfast\nCab", exclusions: "Flights\nLunch", notes: "Carry warm clothes" });
    await screen.findByRole("heading", { name: words.form.inclusions });
    expect(document.querySelectorAll("[data-mark=tick]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-mark=cross]")).toHaveLength(2);
    expect(screen.getByText("Carry warm clothes").closest("li")).not.toBeNull();
    const included = screen.getByRole("heading", { name: words.form.inclusions });
    const excluded = screen.getByRole("heading", { name: words.form.exclusions });
    expect(position(included, excluded)).toBeTruthy();
  });

  it("says nothing received in the bad tone", async () => {
    await open({ totals: money(0, 5_250_000) });
    expect(await screen.findByText(words.money.nothingReceived)).toBeTruthy();
    expect(figure(words.money.paid).className).toMatch(/text-status-bad-ink/);
  });

  it("shows what is still to pay in the attention tone once part is paid", async () => {
    await open({ totals: money(1_000_000, 4_250_000) });
    await screen.findByText(words.money.balance, { selector: "dt" });
    expect(figure(words.money.balance).className).toMatch(/text-status-attention-ink/);
    expect(screen.queryByText(words.money.nothingReceived)).toBeNull();
  });

  it("says Paid in full in the good tone", async () => {
    await open({ totals: money(5_250_000, 0) });
    const badge = await screen.findByText(words.money.paidInFull);
    expect(badge.className).toMatch(/text-status-good-ink/);
  });

  it("marks an installment past its date, still unpaid, as overdue in the bad tone", async () => {
    await open({
      totals: money(0, 5_250_000),
      installments: [
        { id: "i1", label: "Advance", amountPaise: 1_000_000, dueOn: "2020-01-01", paid: false },
        { id: "i2", label: "Balance", amountPaise: 4_250_000, dueOn: "2999-01-01", paid: false },
      ],
    });
    const late = await screen.findByText(words.money.overdue);
    expect(late.className).toMatch(/text-status-bad-ink/);
    expect(screen.getAllByText(words.money.toPay)).toHaveLength(1);
  });

  it("shows the departure in green with its day, seats left of total, pickup point and a link", async () => {
    await open({ departure: { id: "0190a000-0000-7000-8000-0000000000d1", title: "Spiti", startDate: "2026-12-04" } });
    const card = (await screen.findByRole("heading", { name: "Departure" })).closest("[data-slot=card]");
    if (!(card instanceof HTMLElement)) throw new Error("no departure card");
    expect(card.className).toMatch(/status-good/);
    expect(await within(card).findByText(/7 of 20 seats left/)).toBeTruthy();
    expect(within(card).getByText(/Fri 4 Dec/)).toBeTruthy();
    expect(await within(card).findByText("Delhi ISBT Kashmere Gate, 6 pm")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Spiti/ })).toHaveAttribute(
      "href",
      expect.stringContaining("0190a000"),
    );
  });

  it("ends with the note that the prices are fixed", async () => {
    await open({});
    const note = await screen.findByText(words.quote.frozenTitle);
    for (const heading of document.querySelectorAll("h1, h2")) inOrder(heading, note);
    expect(note.closest("[class*=text-caption]")).not.toBeNull();
  });
});

describe("a draft's form", () => {
  it("keeps the same order: trip, price, day by day, then inclusions, exclusions and notes", async () => {
    await open({ status: "draft" });
    const order = [words.form.trip, words.form.price, words.form.days, words.form.more].map((name) =>
      screen.getByRole("heading", { name }),
    );
    inOrder(...order);
    inOrder(
      ...[words.form.inclusions, words.form.exclusions, words.form.notes].map((label) => screen.getByLabelText(label)),
    );
  });
});

describe("the layout around the money", () => {
  it("puts Payments after Price and before Day by day below the two columns, and in the side column from xl", async () => {
    await open({ days: [{ title: "Manali", description: "" }] });
    const cardOf = async (name: string) => {
      const card = (await screen.findByRole("heading", { name })).closest("[data-slot=card]");
      if (!(card instanceof HTMLElement)) throw new Error(`no ${name} card`);
      return card;
    };
    const price = await cardOf(words.form.price);
    const payments = await cardOf(words.money.title);
    // Single column: the cards are ordered by CSS, Price first, then Payments, then the rest in page order.
    expect(price.className).toContain("max-xl:-order-2");
    expect(payments.className).toContain("max-xl:-order-1");
    const days = await cardOf(words.form.days);
    expect(days.className).not.toMatch(/max-xl:-order/);
    // Wide: the plan's wrapper and the side column are boxes again, Payments in the sticky side column.
    expect(payments.closest(".xl\\:sticky")).not.toBeNull();
    expect(price.closest(".xl\\:sticky")).toBeNull();
    expect(payments.closest(".xl\\:sticky")?.className).toContain("max-xl:contents");
  });

  it("leaves a draft's Payments where it was", async () => {
    await open({ status: "draft" });
    const card = (await screen.findByRole("heading", { name: words.money.title })).closest("[data-slot=card]");
    expect(card?.className).not.toMatch(/max-xl:-order/);
  });

  it("leaves the departure card untinted when it only offers Add to departure", async () => {
    await open({ status: "draft", departure: null });
    const card = (await screen.findByRole("heading", { name: "Departure" })).closest("[data-slot=card]");
    expect(card?.className).not.toMatch(/status-good/);
  });

  it("says when the departure's details did not load, with Try again", async () => {
    await open(
      { departure: { id: "0190a000-0000-7000-8000-0000000000d1", title: "Spiti", startDate: "2026-12-04" } },
      { "departures.get": { status: 500 } },
    );
    expect(await screen.findByText(messages.departures.quote.loadFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeTruthy();
  });
});
