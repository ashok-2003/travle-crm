// The opened quote read at a glance: its trip big, its price before its plan, the plan as boxes, points that are
// ticked and crossed, payments in the colours people read, a green departure, and the "sent, so fixed" note last.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { QuoteScreen } from "@/quotes/quote-screen";
import type { SignedInMember } from "@/session/me-context";
import { owner, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aQuote } from "./quote";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const words = messages.quotes;
const departure = {
  id: "0190a000-0000-7000-8000-0000000000d1",
  title: "Spiti",
  startDate: "2026-12-04",
  seatsTotal: 20,
  free: 7,
  pickupPoints: "Delhi ISBT Kashmere Gate, 6 pm\nChandigarh, 11 pm",
};
const open = async (
  changes: Parameters<typeof aQuote>[0],
  extra: Record<string, unknown> = {},
  me: SignedInMember = owner,
) => {
  stubApi({ "quotes.get": { data: aQuote(changes) }, ...extra });
  renderScreen(<QuoteScreen quoteId="0199a000-0000-7000-8000-0000000000a1" />, { width: "wide", me });
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

  it("shows the api's state: overdue in the bad tone, due as to pay", async () => {
    // The dates say the opposite, so the badges can only come from the api's state.
    await open({
      totals: money(0, 5_250_000),
      installments: [
        { id: "i1", label: "Advance", amountPaise: 1_000_000, dueOn: "2999-01-01", paid: false, state: "overdue" },
        { id: "i2", label: "Balance", amountPaise: 4_250_000, dueOn: "2020-01-01", paid: false, state: "due" },
      ],
    });
    const late = await screen.findByText(words.money.overdue);
    expect(late.className).toMatch(/text-status-bad-ink/);
    expect(screen.getAllByText(words.money.toPay)).toHaveLength(1);
  });

  it("falls back to the day when an older api sends no state", async () => {
    const older = { id: "i1", label: "Advance", amountPaise: 1_000_000, dueOn: "2020-01-01", paid: false };
    await open({
      totals: money(0, 5_250_000),
      installments: [older as unknown as QuoteDetail["installments"][number]],
    });
    expect(await screen.findByText(words.money.overdue)).toBeTruthy();
  });

  it("shows the departure in green with its day, seats left of total, pickup point and a link", async () => {
    // Operations: sees quotes and departures, may not change a quote; everything on the card comes with the quote.
    await open({ departure }, {}, member({ permissions: ["quotes:view", "departures:view"] }));
    const card = screen.getByRole("region", { name: "Departure" });
    expect(card.className).toMatch(/status-good/);
    expect(within(card).getByText(/7 of 20 seats left/)).toBeTruthy();
    expect(within(card).getByText(/Fri 4 Dec/)).toBeTruthy();
    expect(within(card).getByText("Delhi ISBT Kashmere Gate, 6 pm")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Spiti/ })).toHaveAttribute(
      "href",
      expect.stringContaining("0190a000"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ends with the note that the prices are fixed", async () => {
    await open({});
    const note = await screen.findByText(words.quote.frozenTitle);
    for (const heading of document.querySelectorAll("h1, h2")) inOrder(heading, note);
    expect(note.closest("[class*=text-caption]")).not.toBeNull();
  });
});

describe("an AI booking's quote, waiting for payment", () => {
  const waiting = { status: "draft", paymentWait: "waiting" } as const;

  it("reads Waiting for payment in the header, not Draft", async () => {
    const heading = await open(waiting);
    const header = heading.parentElement ?? document.body;
    expect(within(header).getByText(words.status.waiting)).toBeTruthy();
    expect(within(header).queryByText(words.status.draft)).toBeNull();
  });

  it("opens read like a sent quote: the trip line, the price as text and the money in its colours", async () => {
    await open({ ...waiting, totals: money(0, 5_250_000) });
    expect(await screen.findByText(/Fri 4 Dec · 1 adult/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: words.form.price })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: words.form.trip })).toBeNull();
    expect(screen.getByText(words.money.nothingReceived)).toBeTruthy();
    expect(figure(words.money.paid).className).toMatch(/text-status-bad-ink/);
  });

  it("opens the form on Edit", async () => {
    await open(waiting);
    await userEvent.click(await screen.findByRole("link", { name: words.quote.edit }));
    expect(await screen.findByRole("heading", { name: words.form.trip })).toBeTruthy();
    expect(screen.queryByText(/Fri 4 Dec · 1 adult/)).toBeNull();
  });

  it("is a plain draft when an older api sends no wait", async () => {
    const older: Partial<ReturnType<typeof aQuote>> = aQuote({ status: "draft" });
    delete older.paymentWait;
    await open({}, { "quotes.get": { data: older } });
    expect(await screen.findByRole("heading", { name: words.form.trip })).toBeTruthy();
    expect(screen.getAllByText(words.status.draft).length).toBeGreaterThan(0);
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

  it("shows the departure's day alone when an older api sends no seats or pickup points", async () => {
    await open({
      departure: { id: departure.id, title: departure.title, startDate: departure.startDate } as typeof departure,
    });
    const card = screen.getByRole("region", { name: "Departure" });
    expect(within(card).getByText(/Fri 4 Dec/)).toBeTruthy();
    expect(within(card).queryByText(/seats left/)).toBeNull();
  });
});
