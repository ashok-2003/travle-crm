// The Bookings list as a table (bookings revamp, 2026-11-27): on a computer the columns booking, trip, travel date, people,
// status, total, paid and to pay (red, and said, when a payment is overdue), details and salesperson; a row's press opens
// the booking; the search box sends a search only with text in it, never into the address; Filters sets travel dates,
// payment and (for a member who sees everyone's) the salesperson, shown as chips that let them go; "Showing 1–25 of 132",
// 25, 50 or 100 a page and the arrows; the status chips; a phone's stacked rows under the same toolbar; and an api too old
// for the table says the list didn't load, with Try again.
import type { BookingTableRow } from "@travel-crm/contracts/bookings";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsScreen } from "@/bookings/bookings-screen";
import { messages } from "@/i18n/messages";
import { forgetTabValues, readTabValue } from "@/lib/tab-storage";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { address, routerCalls } from "../leads/navigation";
import { inputsTo, lastInputTo, owner, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const words = messages.bookings.list;
const tripWords = messages.common.tripFilters;
const { pagination } = messages.common;
// Friday 27 November 2026 in India: December's days show without their year.
const NOW = new Date("2026-11-27T05:30:00Z");

/** A salesperson's Sales role: their own bookings only. */
const salesperson = member({ name: "Ravi Kumar", permissions: ["bookings:view", "bookings:edit"] });

function aRow(overrides: Partial<BookingTableRow> = {}): BookingTableRow {
  return {
    id: "0199b000-0000-7000-8000-000000000001",
    number: "BK-2026-0001",
    status: "confirmed",
    leadId: "0199b000-0000-7000-8000-0000000000a1",
    quoteId: "0199b000-0000-7000-8000-0000000000b1",
    customerName: "Meera Iyer",
    title: "Kerala backwaters",
    startDate: "2026-12-20",
    endDate: "2026-12-27",
    departure: null,
    totalPaise: 150_000_00,
    paidPaise: 45_000_00,
    balancePaise: 105_000_00,
    travellersTotal: 3,
    travellersComplete: 1,
    pendingClaims: 0,
    refundDuePaise: 0,
    paymentState: "part_paid",
    adults: 2,
    children: 1,
    ownerName: "Ravi Kumar",
    ...overrides,
  };
}

const aPage = (items: BookingTableRow[], total = items.length) => ({ data: { items, total } });

function renderBookings(answers: Record<string, Answer> = {}, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "bookings.page": aPage([aRow()]),
    "bookings.salespeople": { data: [{ userId: "0199a000-0000-7000-8000-0000000000a2", name: "Ravi Kumar" }] },
    ...answers,
  });
  renderScreen(<BookingsScreen />, { width: "wide", ...options });
  return api;
}

const table = () => screen.findByRole("table", { name: words.bookings });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  address.set("/bookings");
  forgetTabValues();
  routerCalls.push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BookingsScreen", () => {
  it("shows the table's columns, sorted by travel date soonest first, 25 a page", async () => {
    renderBookings();
    expect(
      within(await table())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      words.columns.booking,
      words.columns.trip,
      words.columns.travel,
      words.columns.people,
      words.columns.status,
      words.columns.total,
      words.columns.paid,
      words.columns.details,
      words.columns.salesperson,
    ]);
    const meera = within(screen.getByRole("row", { name: /Meera Iyer/ }));
    expect(meera.getByRole("link", { name: "Meera Iyer" })).toHaveAttribute("href", `/bookings/${aRow().id}`);
    for (const text of ["BK-2026-0001", "Kerala backwaters", "20 Dec", "2 adults, 1 child", "Confirmed", "₹1,50,000"]) {
      expect(meera.getByText(text)).toBeVisible();
    }
    // The amount in the numbers font, the word in the text's own.
    expect(meera.getByText("₹45,000")).toHaveClass("numbers");
    expect(meera.getByText("₹45,000").parentElement).toHaveTextContent(/^₹45,000 paid$/);
    expect(meera.getByText(/to pay$/)).toHaveTextContent(/^₹1,05,000 to pay$/);
    expect(meera.getByText(/to pay$/)).not.toHaveClass("text-status-bad-ink");
    // Only the numbers in the numbers font, never the words between them.
    expect(meera.getByText("1")).toHaveClass("numbers");
    expect(meera.getByText("1").parentElement).toHaveTextContent(/^1 of 3$/);
    expect(meera.getByText("Ravi Kumar")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: words.columns.travel })).toHaveAttribute("aria-sort", "ascending");
    expect(inputsTo("bookings.page")).toEqual([{ page: 1, limit: 25, sort: "upcoming", direction: "asc" }]);
  });

  it("says a payment is overdue in red, with the word", async () => {
    renderBookings({ "bookings.page": aPage([aRow({ paymentState: "overdue" })]) });
    await table();
    const row = within(screen.getByRole("row", { name: /Meera Iyer/ }));
    expect(row.getByText(/to pay$/)).toHaveTextContent(/^₹1,05,000 to pay$/);
    expect(row.getByText(/to pay$/)).toHaveClass("text-status-bad-ink");
    expect(row.getByText(words.overdue)).toBeVisible();
  });

  it("opens the booking from a press anywhere on its row", async () => {
    renderBookings();
    await table();
    await userEvent.click(within(screen.getByRole("row", { name: /Meera Iyer/ })).getByText("Kerala backwaters"));
    expect(routerCalls.push).toHaveBeenLastCalledWith(`/bookings/${aRow().id}`);
  });

  it("searches once there is text, keeps it in the tab and never in the address", async () => {
    address.set("/bookings?page=2");
    renderBookings({ "bookings.page": aPage([aRow()], 30) });
    await table();
    expect(lastInputTo("bookings.page")).not.toHaveProperty("search");
    await userEvent.type(screen.getByRole("searchbox", { name: words.search }), "98765");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toEqual({
        page: 1,
        limit: 25,
        sort: "upcoming",
        direction: "asc",
        search: "98765",
      });
    });
    expect(address.href).toBe("/bookings");
    expect(readTabValue("bookings.search")).toBe("98765");
    await userEvent.clear(screen.getByRole("searchbox", { name: words.search }));
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).not.toHaveProperty("search");
    });
  });

  it("applies travel dates and a payment from Filters, as chips that let each go", async () => {
    renderBookings();
    await table();
    await userEvent.click(screen.getByRole("button", { name: words.filtersButton }));
    const dialog = await screen.findByRole("dialog", { name: words.filtersDialog.title });
    await userEvent.type(within(dialog).getByLabelText(tripWords.travelFrom), "01/12/2026");
    await userEvent.type(within(dialog).getByLabelText(tripWords.travelTo), "31/12/2026");
    await userEvent.click(within(dialog).getByRole("combobox", { name: words.filtersDialog.payment }));
    await userEvent.click(await screen.findByRole("option", { name: words.filtersDialog.payments.overdue }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.filtersDialog.apply }));
    expect(address.href).toBe("/bookings?from=2026-12-01&to=2026-12-31&payment=overdue");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toMatchObject({
        travelFrom: "2026-12-01",
        travelTo: "2026-12-31",
        payment: "overdue",
      });
    });
    const applied = screen.getByRole("group", { name: messages.common.table.appliedFilters });
    expect(
      within(applied)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Travel 1 Dec to 31 Dec", "Payment: Overdue"]);
    expect(screen.getByRole("button", { name: "Filters, 2 chosen" })).toBeVisible();
    await userEvent.click(within(applied).getByRole("button", { name: "Remove the filter Payment: Overdue" }));
    expect(address.href).toBe("/bookings?from=2026-12-01&to=2026-12-31");
    await userEvent.click(within(applied).getByRole("button", { name: "Remove the filter Travel 1 Dec to 31 Dec" }));
    expect(address.href).toBe("/bookings");
    expect(screen.queryByRole("group", { name: messages.common.table.appliedFilters })).not.toBeInTheDocument();
  });

  it("lets every filter go from Filters' Clear all, keeping the status chip", async () => {
    address.set(
      "/bookings?status=confirmed&from=2026-12-01&salesperson=0199a000-0000-7000-8000-0000000000a2&payment=paid",
    );
    renderBookings();
    await table();
    expect(lastInputTo("bookings.page")).toMatchObject({ travelFrom: "2026-12-01", payment: "paid" });
    await userEvent.click(screen.getByRole("button", { name: "Filters, 3 chosen" }));
    const dialog = await screen.findByRole("dialog", { name: words.filtersDialog.title });
    await userEvent.click(within(dialog).getByRole("button", { name: words.filtersDialog.clear }));
    expect(address.href).toBe("/bookings?status=confirmed");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toEqual({
        page: 1,
        limit: 25,
        sort: "upcoming",
        direction: "asc",
        status: "confirmed",
      });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: messages.common.table.appliedFilters })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: words.filtersButton })).toBeVisible();
  });

  it("refuses an until day before the from day", async () => {
    renderBookings();
    await table();
    await userEvent.click(screen.getByRole("button", { name: words.filtersButton }));
    const dialog = await screen.findByRole("dialog", { name: words.filtersDialog.title });
    await userEvent.type(within(dialog).getByLabelText(tripWords.travelFrom), "10/12/2026");
    await userEvent.type(within(dialog).getByLabelText(tripWords.travelTo), "01/12/2026");
    await userEvent.click(within(dialog).getByRole("button", { name: words.filtersDialog.apply }));
    expect(await within(dialog).findByText(tripWords.problems.toBeforeFrom)).toBeVisible();
    expect(address.href).toBe("/bookings");
  });

  it("says which of how many are shown, 25, 50 or 100 a page, with the arrows", async () => {
    renderBookings({ "bookings.page": aPage([aRow()], 132) });
    await table();
    const bar = screen.getByRole("navigation", { name: pagination.label });
    expect(bar).toHaveTextContent("Showing 1–25 of 132 bookings");
    await userEvent.click(within(bar).getByRole("button", { name: pagination.next }));
    expect(routerCalls.push).toHaveBeenLastCalledWith("/bookings?page=2");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toMatchObject({ page: 2, limit: 25 });
    });
    await userEvent.click(within(bar).getByRole("combobox", { name: pagination.rowsPerPage }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["25", "50", "100"]);
    await userEvent.click(screen.getByRole("option", { name: "50" }));
    expect(address.href).toBe("/bookings?size=50");
  });

  it("sorts by a header, and turns it round on a second press", async () => {
    renderBookings();
    await table();
    await userEvent.click(screen.getByRole("button", { name: words.columns.total }));
    expect(address.href).toBe("/bookings?sort=total");
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: words.columns.total })).toHaveAttribute("aria-sort", "ascending");
    });
    await userEvent.click(screen.getByRole("button", { name: words.columns.total }));
    expect(address.href).toBe("/bookings?sort=total&direction=desc");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toMatchObject({ sort: "total", direction: "desc" });
    });
  });

  it("keeps the status chips: one status, or the payments to check", async () => {
    renderBookings();
    await table();
    await userEvent.click(screen.getByRole("radio", { name: words.filters.confirmed }));
    expect(address.href).toBe("/bookings?status=confirmed");
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toMatchObject({ status: "confirmed" });
    });
    await userEvent.click(screen.getByRole("radio", { name: words.filters.claims }));
    await waitFor(() => {
      expect(lastInputTo("bookings.page")).toMatchObject({ claimsPending: true });
    });
    expect(lastInputTo("bookings.page")).not.toHaveProperty("status");
  });

  it("stacks the rows on a phone, each one link, under the same toolbar", async () => {
    renderBookings({}, { width: "phone" });
    const list = await screen.findByRole("list", { name: words.bookings });
    const link = within(within(list).getByRole("listitem")).getByRole("link");
    expect(link).toHaveAttribute("href", `/bookings/${aRow().id}`);
    expect(link).toHaveTextContent("Meera Iyer");
    expect(link).toHaveTextContent("Kerala backwaters · 20 Dec");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: words.search })).toBeVisible();
    expect(screen.getByRole("button", { name: words.filtersButton })).toBeVisible();
  });

  it("says the list didn't load, with Try again, on an api without the table", async () => {
    const api = renderBookings({ "bookings.page": { status: 404 } });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("bookings.page", aPage([aRow()]));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await table()).toBeVisible();
  });

  it("offers the salesperson only to a member who sees everyone's bookings", async () => {
    renderBookings({}, { me: owner });
    await table();
    await userEvent.click(screen.getByRole("button", { name: words.filtersButton }));
    const dialog = await screen.findByRole("dialog", { name: words.filtersDialog.title });
    await userEvent.click(within(dialog).getByRole("combobox", { name: tripWords.salesperson }));
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.filtersDialog.apply }));
    expect(address.href).toBe("/bookings?salesperson=0199a000-0000-7000-8000-0000000000a2");
    expect(await screen.findByRole("button", { name: "Remove the filter Salesperson: Ravi Kumar" })).toBeVisible();
  });

  it("gives a member who sees only their own no salesperson, even from the address", async () => {
    address.set("/bookings?salesperson=0199a000-0000-7000-8000-0000000000a2");
    const api = renderBookings({}, { me: salesperson });
    await table();
    expect(screen.queryByRole("columnheader", { name: words.columns.salesperson })).not.toBeInTheDocument();
    expect(lastInputTo("bookings.page")).not.toHaveProperty("ownerUserId");
    await userEvent.click(screen.getByRole("button", { name: words.filtersButton }));
    const dialog = await screen.findByRole("dialog", { name: words.filtersDialog.title });
    expect(within(dialog).queryByRole("combobox", { name: tripWords.salesperson })).not.toBeInTheDocument();
    expect(api.calls).not.toContain("bookings.salespeople");
  });
});
