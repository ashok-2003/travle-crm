// The shared server-side table (bookings revamp, 2026-11-27): its header row held at the top of the rows' own box and its
// first column pinned; a header sorts, then turns round, and says how it sorts; a row's press opens its record, though not
// a press on the row's own link; the toolbar stays over every state (loading, empty, failed with Try again); a phone's
// rows stack as links. And the address a table keeps: what differs from the start, read back with each value's schema.
// The applied filters' chips, each letting its filter go.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppliedFilters } from "@/components/data-table/applied-filters";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { readTableAddress, tableAddressHref } from "@/components/data-table/table-address";
import { locale, messages } from "@/i18n/messages";
import { routerCalls } from "../leads/navigation";
import { screenIs } from "../organization/render";

vi.mock("next/navigation", () => import("../leads/navigation"));

interface Trip {
  id: string;
  name: string;
  total: number;
}

const columns: DataColumn<Trip, "name" | "total">[] = [
  { key: "name", header: "Name", sort: "name", cell: (trip) => <a href={`/trips/${trip.id}`}>{trip.name}</a> },
  { key: "place", header: "Place", cell: () => "Spiti" },
  { key: "total", header: "Total", sort: "total", width: 120, end: true, cell: (trip) => String(trip.total) },
];

const trips: Trip[] = [
  { id: "a", name: "Meera", total: 10 },
  { id: "b", name: "Dev", total: 20 },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Trip, "name" | "total">>[0]> = {}) {
  const onSort = vi.fn();
  const onRetry = vi.fn();
  const view = (ui: ReactNode) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
  render(
    view(
      <DataTable
        label="Trips"
        columns={columns}
        rows={trips}
        rowKey={(trip) => trip.id}
        rowHref={(trip) => `/trips/${trip.id}`}
        stacked={(trip) => trip.name}
        total={2}
        page={1}
        limit={25}
        sizes={[25, 50, 100]}
        noun="trips"
        onPage={vi.fn()}
        onLimit={vi.fn()}
        sort={{ key: "name", direction: "asc" }}
        onSort={onSort}
        busy={false}
        error={null}
        onRetry={onRetry}
        loadFailed="Trips didn't load."
        loadingLabel="Loading trips"
        toolbar={<input aria-label="Search trips" />}
        empty={<p>No trips yet.</p>}
        {...props}
      />,
    ),
  );
  return { onSort, onRetry };
}

beforeEach(() => {
  screenIs("wide");
  routerCalls.push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataTable", () => {
  it("holds its header row at the top and pins the first column", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader");
    for (const header of headers) expect(header).toHaveClass("sticky", "top-0");
    expect(headers[0]).toHaveClass("left-0");
    expect(screen.getByRole("cell", { name: "Meera" })).toHaveClass("sticky", "left-0");
    expect(screen.getByRole("navigation", { name: messages.common.pagination.label })).toHaveTextContent(
      "Showing 1–2 of 2 trips",
    );
  });

  it("sorts by a header, turns the sorted one round, and says how it sorts", async () => {
    const { onSort } = renderTable();
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Total" })).not.toHaveAttribute("aria-sort");
    expect(within(screen.getByRole("columnheader", { name: "Place" })).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSort).toHaveBeenLastCalledWith({ key: "name", direction: "desc" });
    await userEvent.click(screen.getByRole("button", { name: "Total" }));
    expect(onSort).toHaveBeenLastCalledWith({ key: "total", direction: "asc" });
  });

  it("opens a row's record from a press on it, but leaves a press on its link to the link", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("cell", { name: "20" }));
    expect(routerCalls.push).toHaveBeenLastCalledWith("/trips/b");
    routerCalls.push.mockClear();
    screen.getByRole("link", { name: "Meera" }).addEventListener("click", (event) => {
      event.preventDefault();
    });
    await userEvent.click(screen.getByRole("link", { name: "Meera" }));
    expect(routerCalls.push).not.toHaveBeenCalled();
  });

  it("keeps its toolbar over a failure, with Try again, and over an empty list", async () => {
    const { onRetry } = renderTable({ rows: undefined, error: new TypeError("Failed to fetch") });
    expect(screen.getByRole("textbox", { name: "Search trips" })).toBeVisible();
    expect(screen.getByText("Trips didn't load.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows what an empty list says", () => {
    renderTable({ rows: [], total: 0 });
    expect(screen.getByText("No trips yet.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("fades the rows in view while another page loads", () => {
    renderTable({ busy: true });
    expect(screen.getByRole("table", { name: "Trips" }).closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
  });

  it("stacks its rows on a phone, each one link", () => {
    screenIs("phone");
    renderTable();
    const items = within(screen.getByRole("list", { name: "Trips" })).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("link").getAttribute("href"))).toEqual(["/trips/a", "/trips/b"]);
  });
});

describe("a table's address", () => {
  const fields = {
    status: { name: "status", schema: z.enum(["all", "open"]) },
    page: { name: "page", schema: z.coerce.number().pipe(z.int().min(1)) },
  };
  const start = { status: "all" as "all" | "open", page: 1 };

  it("writes only what differs from the start", () => {
    expect(tableAddressHref("/trips", fields, { status: "open", page: 1 }, start)).toBe("/trips?status=open");
    expect(tableAddressHref("/trips", fields, start, start)).toBe("/trips");
  });

  it("reads each value with its schema, the start for what it refuses", () => {
    expect(readTableAddress(new URLSearchParams("status=open&page=3"), fields, start)).toEqual({
      status: "open",
      page: 3,
    });
    expect(readTableAddress(new URLSearchParams("status=shut&page=-1"), fields, start)).toEqual(start);
  });
});

describe("AppliedFilters", () => {
  it("shows nothing with nothing applied, and each chip lets its filter go", async () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppliedFilters chips={[]} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppliedFilters chips={[{ label: "Overdue", onRemove }]} />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove the filter Overdue" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
