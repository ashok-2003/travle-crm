// /quotes as a table (bookings revamp, 2026-11-27): the columns customer, trip, travel date, status (a draft behind an
// unpaid AI booking says Waiting for payment or Hold expired), total (and what is still to pay on an accepted quote), last
// change and salesperson; last changed first, 25 a page; a search ("Search quotes") that never goes in the address,
// survives a reload in the tab and is sent only with text in it; the status chips and Filters (travel dates, and the
// salesperson for a member who sees everyone's) as chips that let them go; the numbered pages and the headers' sorts; a
// phone's stacked rows; an api too old for the table says the list didn't load; and New quote asks for the lead.
import type { QuoteTableRow } from "@travel-crm/contracts/quotes";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { forgetTabValues, readTabValue } from "@/lib/tab-storage";
import { QuotesScreen } from "@/quotes/quotes-screen";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { address, routerCalls } from "../leads/navigation";
import { inputsTo, lastInputTo, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const { list, status } = messages.quotes;
const tripWords = messages.common.tripFilters;
const { pagination } = messages.common;
// Friday 27 November 2026 in India: this year's days show without their year.
const NOW = new Date("2026-11-27T05:30:00Z");
const START = { page: 1, limit: 25, sort: "updated", direction: "desc" };

const ids = {
  waiting: "0199a000-0000-7000-8000-000000000011",
  expired: "0199a000-0000-7000-8000-000000000012",
  plain: "0199a000-0000-7000-8000-000000000013",
};

const aRow = (overrides: Partial<QuoteTableRow> & { id: string }): QuoteTableRow => ({
  leadId: "0199a000-0000-7000-8000-0000000000aa",
  customerName: "Meera Kapoor",
  title: "Spiti circuit",
  startDate: "2026-12-04",
  status: "draft",
  paymentWait: null,
  totals: { subtotalPaise: 0, taxPaise: 0, totalPaise: 1_000_000, paidPaise: 0, balancePaise: 1_000_000 },
  updatedAt: "2026-11-26T08:00:00.000Z",
  ownerName: "Ravi Kumar",
  ...overrides,
});

const rows = [
  aRow({ id: ids.waiting, paymentWait: "waiting" }),
  aRow({ id: ids.expired, customerName: "Ravi Shah", paymentWait: "hold_expired" }),
  aRow({
    id: ids.plain,
    customerName: "Anil Rao",
    title: "Goa",
    status: "accepted",
    totals: { subtotalPaise: 0, taxPaise: 0, totalPaise: 1_000_000, paidPaise: 300_000, balancePaise: 700_000 },
  }),
];

const aPage = (items: QuoteTableRow[], total = items.length) => ({ data: { items, total } });

/** A Sales member: their own quotes only. */
const salesperson = member({ name: "Ravi Kumar", permissions: ["quotes:view", "quotes:create", "quotes:edit"] });

function renderQuotes(answers: Record<string, Answer> = {}, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "quotes.page": (input) => {
      const search = (input as { search?: string } | undefined)?.search;
      const found =
        search === undefined
          ? rows
          : rows.filter((row) => row.customerName.toLowerCase().includes(search.toLowerCase()));
      return aPage(found);
    },
    "quotes.salespeople": { data: [{ userId: "0199a000-0000-7000-8000-0000000000a2", name: "Ravi Kumar" }] },
    "leads.list": { data: { items: [], nextCursor: null, total: null, people: {} } },
    ...answers,
  });
  renderScreen(<QuotesScreen />, { width: "wide", ...options });
  return api;
}

const table = () => screen.findByRole("table", { name: list.quotes });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  address.set("/quotes");
  forgetTabValues();
  routerCalls.push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("QuotesScreen", () => {
  it("shows the table's columns, last changed first, 25 a page, and names quotes behind an unpaid AI booking", async () => {
    renderQuotes();
    expect(
      within(await table())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      list.columns.customer,
      list.columns.trip,
      list.columns.travel,
      list.columns.status,
      list.columns.total,
      list.columns.changed,
      list.columns.salesperson,
    ]);
    expect(screen.getByRole("columnheader", { name: list.columns.changed })).toHaveAttribute("aria-sort", "descending");
    expect(inputsTo("quotes.page")).toEqual([START]);
    const meera = within(screen.getByRole("row", { name: /Meera Kapoor/ }));
    expect(meera.getByRole("link", { name: "Meera Kapoor" })).toHaveAttribute("href", `/quotes/${ids.waiting}`);
    for (const text of ["Spiti circuit", "4 Dec", status.waiting, "₹10,000", "26 Nov", "Ravi Kumar"]) {
      expect(meera.getByText(text)).toBeVisible();
    }
    expect(screen.getByText(status.hold_expired)).toBeVisible();
    // An accepted quote says what is still to pay, the amount alone in the numbers font.
    const anil = within(screen.getByRole("row", { name: /Anil Rao/ }));
    expect(anil.getByText("₹7,000")).toHaveClass("numbers");
    expect(anil.getByText("₹7,000").parentElement).toHaveTextContent(/^₹7,000 to pay$/);
  });

  it("opens the quote from a press anywhere on its row", async () => {
    renderQuotes();
    await table();
    await userEvent.click(within(screen.getByRole("row", { name: /Anil Rao/ })).getByText("Goa"));
    expect(routerCalls.push).toHaveBeenLastCalledWith(`/quotes/${ids.plain}`);
  });

  it("narrows the rows as the search is typed, keeps it in the tab and out of the address, and sends none when empty", async () => {
    renderQuotes();
    await screen.findByText("Anil Rao");
    expect(inputsTo("quotes.page").every((input) => !Object.hasOwn(input as object, "search"))).toBe(true);
    const box = screen.getByRole("searchbox", { name: list.search });
    await userEvent.type(box, "ravi");
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({ ...START, search: "ravi" });
    });
    await waitFor(() => {
      expect(screen.queryByText("Anil Rao")).toBeNull();
    });
    expect(screen.getByText("Ravi Shah")).toBeVisible();
    expect(readTabValue("quotes.search")).toBe("ravi");
    expect(address.href).toBe("/quotes");
    await userEvent.clear(box);
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual(START);
    });
  });

  it("finds its search again after a reload", async () => {
    window.sessionStorage.setItem("travel-crm.quotes.search", "ravi");
    renderQuotes();
    expect(await screen.findByRole("searchbox", { name: list.search })).toHaveValue("ravi");
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({ ...START, search: "ravi" });
    });
  });

  it("says nothing matched a search that found nothing, with Clear filters", async () => {
    renderQuotes();
    await table();
    await userEvent.type(screen.getByRole("searchbox", { name: list.search }), "zzz");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(list.emptyFiltered);
    });
    // Said on the screen, and to screen readers by the list's polite status.
    await userEvent.click(await screen.findByRole("button", { name: list.clearFilters }));
    expect(await screen.findByRole("searchbox", { name: list.search })).toHaveValue("");
    expect(await table()).toBeVisible();
  });

  it("keeps the status chips: one status, or the accepted quotes with money to come", async () => {
    renderQuotes();
    await table();
    await userEvent.click(screen.getByRole("radio", { name: list.filters.sent }));
    expect(address.href).toBe("/quotes?status=sent");
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({ ...START, status: "sent" });
    });
    await userEvent.click(screen.getByRole("radio", { name: list.filters.due }));
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({ ...START, balanceDue: true });
    });
  });

  it("applies travel dates and a salesperson from Filters, as chips that let each go, and Clear all lets every one go", async () => {
    renderQuotes();
    await table();
    await userEvent.click(screen.getByRole("button", { name: list.filtersButton }));
    let dialog = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    await userEvent.type(within(dialog).getByLabelText(tripWords.travelFrom), "01/12/2026");
    await userEvent.click(within(dialog).getByRole("combobox", { name: tripWords.salesperson }));
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: list.filtersDialog.apply }));
    expect(address.href).toBe("/quotes?from=2026-12-01&salesperson=0199a000-0000-7000-8000-0000000000a2");
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({
        ...START,
        travelFrom: "2026-12-01",
        ownerUserId: "0199a000-0000-7000-8000-0000000000a2",
      });
    });
    const applied = screen.getByRole("group", { name: messages.common.table.appliedFilters });
    expect(
      within(applied)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Travel from 1 Dec", "Salesperson: Ravi Kumar"]);
    await userEvent.click(within(applied).getByRole("button", { name: "Remove the filter Travel from 1 Dec" }));
    expect(address.href).toBe("/quotes?salesperson=0199a000-0000-7000-8000-0000000000a2");
    await userEvent.click(screen.getByRole("button", { name: "Filters, 1 chosen" }));
    dialog = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    await userEvent.click(within(dialog).getByRole("button", { name: list.filtersDialog.clear }));
    expect(address.href).toBe("/quotes");
  });

  it("says which of how many are shown, 25, 50 or 100 a page, and sorts by a header", async () => {
    renderQuotes({ "quotes.page": aPage(rows, 60) });
    await table();
    const bar = screen.getByRole("navigation", { name: pagination.label });
    expect(bar).toHaveTextContent("Showing 1–25 of 60 quotes");
    await userEvent.click(within(bar).getByRole("button", { name: pagination.next }));
    expect(routerCalls.push).toHaveBeenLastCalledWith("/quotes?page=2");
    await userEvent.click(screen.getByRole("button", { name: list.columns.travel }));
    expect(address.href).toBe("/quotes?sort=travel&direction=asc");
    await waitFor(() => {
      expect(lastInputTo("quotes.page")).toEqual({ ...START, sort: "travel", direction: "asc" });
    });
    // Last change sorts newest first on its first press.
    await userEvent.click(screen.getByRole("button", { name: list.columns.changed }));
    expect(address.href).toBe("/quotes");
  });

  it("stacks the rows on a phone, each one link, under the same toolbar", async () => {
    renderQuotes({}, { width: "phone" });
    const quotes = await screen.findByRole("list", { name: list.quotes });
    const links = within(quotes).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(Object.values(ids).map((id) => `/quotes/${id}`));
    expect(links[0]).toHaveTextContent("Spiti circuit · 4 Dec");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: list.search })).toBeVisible();
    expect(screen.getByRole("button", { name: list.filtersButton })).toBeVisible();
  });

  it("says the list didn't load, with Try again, on an api without the table", async () => {
    const api = renderQuotes({ "quotes.page": { status: 404 } });
    expect(await screen.findByText(list.loadFailed)).toBeVisible();
    api.answer("quotes.page", aPage(rows));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await table()).toBeVisible();
  });

  it("gives a member who sees only their own no salesperson, even from the address", async () => {
    address.set("/quotes?salesperson=0199a000-0000-7000-8000-0000000000a2");
    const api = renderQuotes({}, { me: salesperson });
    await table();
    expect(screen.queryByRole("columnheader", { name: list.columns.salesperson })).not.toBeInTheDocument();
    expect(lastInputTo("quotes.page")).toEqual(START);
    await userEvent.click(screen.getByRole("button", { name: list.filtersButton }));
    const dialog = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    expect(within(dialog).queryByRole("combobox", { name: tripWords.salesperson })).not.toBeInTheDocument();
    expect(api.calls).not.toContain("quotes.salespeople");
  });

  it("New quote opens a dialog that asks for the lead first", async () => {
    renderQuotes();
    await userEvent.click(await screen.findByRole("button", { name: list.new }));
    expect(await screen.findByRole("dialog", { name: list.newQuote.title })).toBeVisible();
    expect(screen.getByPlaceholderText(list.newQuote.search)).toBeVisible();
    expect(screen.getByRole("link", { name: list.newQuote.newLead })).toHaveAttribute("href", "/leads/new");
  });
});
