// /quotes: a table of quotes with a search ("Search quotes") that never goes in the address and survives a reload in the
// tab, status chips, a badge for a quote waiting for payment or whose hold expired, and New quote, which asks for the lead.
import type { QuoteSummary } from "@travel-crm/contracts/quotes";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { forgetTabValues, readTabValue } from "@/lib/tab-storage";
import { QuotesScreen } from "@/quotes/quotes-screen";
import { stubApi } from "../support/api-stub";
import { address } from "../leads/navigation";
import { inputsTo, lastInputTo, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const { list, status } = messages.quotes;

const aQuote = (overrides: Partial<QuoteSummary> & { id: string }): Record<string, unknown> => ({
  leadId: "0199a000-0000-7000-8000-0000000000aa",
  customerName: "Meera Kapoor",
  title: "Spiti circuit",
  startDate: "2026-12-04",
  status: "draft",
  paymentWait: null,
  totals: { subtotalPaise: 0, taxPaise: 0, totalPaise: 1_000_000, paidPaise: 0, balancePaise: 1_000_000 },
  updatedAt: "2026-11-26T08:00:00.000Z",
  ...overrides,
});

const quoteIds = {
  waiting: "0199a000-0000-7000-8000-000000000011",
  expired: "0199a000-0000-7000-8000-000000000012",
  plain: "0199a000-0000-7000-8000-000000000013",
};

function renderQuotes(rows: Record<string, unknown>[] = []) {
  stubApi({
    "quotes.list": (input) => {
      const search = (input as { search?: string } | undefined)?.search;
      const found =
        search === undefined
          ? rows
          : rows.filter((row) => String(row.customerName).toLowerCase().includes(search.toLowerCase()));
      return { data: found };
    },
  });
  renderScreen(<QuotesScreen />, { width: "wide" });
}

beforeEach(() => {
  address.set("/quotes");
  forgetTabValues();
});

describe("QuotesScreen", () => {
  const rows = [
    aQuote({ id: quoteIds.waiting, paymentWait: "waiting" }),
    aQuote({ id: quoteIds.expired, customerName: "Ravi Shah", paymentWait: "hold_expired" }),
    aQuote({ id: quoteIds.plain, customerName: "Anil Rao", title: "Goa" }),
  ];

  it("is a table with a Search quotes box and the chips, and names quotes behind an unpaid AI booking", async () => {
    renderQuotes(rows);
    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search quotes" })).toBeVisible();
    expect(screen.getByRole("radio", { name: list.filters.due })).toBeVisible();
    expect(await screen.findByText(status.waiting)).toBeVisible();
    expect(screen.getByText(status.hold_expired)).toBeVisible();
    expect(screen.getAllByText(status.draft)).toHaveLength(1);
  });

  it("narrows the rows as the search is typed, keeps it in the tab, and keeps it out of the address", async () => {
    renderQuotes(rows);
    await screen.findByText(/Anil Rao/);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search quotes" }), "ravi");
    await waitFor(() => {
      expect(lastInputTo("quotes.list")).toEqual({ search: "ravi" });
    });
    await waitFor(() => {
      expect(screen.queryByText(/Anil Rao/)).toBeNull();
    });
    expect(screen.getByText(/Ravi Shah/)).toBeVisible();
    expect(readTabValue("quotes.search")).toBe("ravi");
    expect(window.location.search).toBe("");
    expect(inputsTo("quotes.list").length).toBeGreaterThan(1);
  });

  it("sends no search while the box is empty or cleared, so an api from before search still lists", async () => {
    renderQuotes(rows);
    await screen.findByText(/Anil Rao/);
    expect(inputsTo("quotes.list").every((input) => !Object.hasOwn(input as object, "search"))).toBe(true);
    const box = screen.getByRole("searchbox", { name: "Search quotes" });
    await userEvent.type(box, "ravi");
    await waitFor(() => {
      expect(lastInputTo("quotes.list")).toEqual({ search: "ravi" });
    });
    await userEvent.clear(box);
    await waitFor(() => {
      expect(lastInputTo("quotes.list")).toEqual({});
    });
  });

  it("finds its search again after a reload", async () => {
    window.sessionStorage.setItem("travel-crm.quotes.search", "ravi");
    renderQuotes(rows);
    expect(await screen.findByRole("searchbox", { name: "Search quotes" })).toHaveValue("ravi");
    await waitFor(() => {
      expect(lastInputTo("quotes.list")).toEqual({ search: "ravi" });
    });
  });

  it("reads Draft on a quote from an older api that sends no paymentWait", async () => {
    const older = aQuote({ id: quoteIds.plain });
    delete older.paymentWait;
    renderQuotes([older]);
    expect(await screen.findByText(status.draft)).toBeVisible();
  });

  it("says nothing matched a search that found nothing", async () => {
    renderQuotes(rows);
    await screen.findByRole("table");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search quotes" }), "zzz");
    expect(await screen.findByText(list.noMatch)).toBeVisible();
  });

  it("New quote opens a dialog that asks for the lead first", async () => {
    renderQuotes(rows);
    await userEvent.click(await screen.findByRole("button", { name: list.new }));
    const dialog = await screen.findByRole("dialog", { name: list.newQuote.title });
    expect(dialog).toBeVisible();
    expect(screen.getByPlaceholderText(list.newQuote.search)).toBeVisible();
    expect(screen.getByRole("link", { name: list.newQuote.newLead })).toHaveAttribute("href", "/leads/new");
  });
});
