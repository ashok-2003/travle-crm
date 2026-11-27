// The Quotes list's Export (bookings revamp, 2026-11-27): in the list's toolbar, a dialog saying what the file holds as
// the list shows it (its status chip, Filters and search) and asking for Excel or CSV with that filter; and the export's
// page, where the bell leads, downloading the file.
import type { QuoteExportDetail, QuoteTableRow } from "@travel-crm/contracts/quotes";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { forgetTabValues, keepTabValue } from "@/lib/tab-storage";
import { QuoteExportScreen } from "@/quotes/export/quote-export-screen";
import { QuotesScreen } from "@/quotes/quotes-screen";
import { stubApi } from "../support/api-stub";
import { address } from "../leads/navigation";
import { inputsTo, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.quotes.export;
const exportWords = messages.exports;
// Friday 27 November 2026 in India: December's days show without their year.
const NOW = new Date("2026-11-27T05:30:00Z");
const exportId = "0199e7a0-0000-7000-8000-0000000000e4";
const link = { url: "https://files.example/quotes.csv", expiresAt: "2099-10-20T05:05:00.000Z" };

const row: QuoteTableRow = {
  id: "0199a000-0000-7000-8000-000000000011",
  leadId: "0199a000-0000-7000-8000-0000000000aa",
  customerName: "Meera Kapoor",
  title: "Spiti circuit",
  startDate: "2026-12-04",
  status: "accepted",
  paymentWait: null,
  totals: { subtotalPaise: 0, taxPaise: 0, totalPaise: 1_000_000, paidPaise: 0, balancePaise: 1_000_000 },
  updatedAt: "2026-11-26T08:00:00.000Z",
  ownerName: "Ravi Kumar",
};

const ready: QuoteExportDetail = {
  id: exportId,
  kind: "quotes",
  format: "csv",
  status: "ready",
  failureReason: null,
  rowsTotal: 7,
  rowsDone: 7,
  file: { fileName: "quotes-2026-11-27-1100.csv", sizeBytes: 1_024 },
  createdAt: "2026-11-27T05:30:00.000Z",
  readyAt: "2026-11-27T05:31:00.000Z",
  expiresAt: "2026-11-28T05:31:00.000Z",
  filter: { status: "sent", travelTo: "2026-12-31" },
  salespersonName: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  forgetTabValues();
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the Quotes list's Export", () => {
  it("asks for the list as it is on screen, its chip, Filters and search included", async () => {
    address.set("/quotes?status=due&to=2026-12-31");
    keepTabValue("quotes.search", "Meera");
    stubApi({
      "quotes.page": { data: { items: [row], total: 1 } },
      "quotes.salespeople": { data: [] },
      "quoteExports.start": { data: { exportId } },
      "quoteExports.get": { data: { ...ready, status: "making", rowsDone: 0, file: null, readyAt: null } },
    });
    renderScreen(<QuotesScreen />, { width: "wide" });
    await screen.findByRole("table", { name: messages.quotes.list.quotes });
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    expect(within(dialog).getByText('Money to come · Travel until 31 Dec · matching "Meera"')).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: exportWords.dialog.prepare }));
    await waitFor(() => {
      expect(inputsTo("quoteExports.start")).toEqual([
        { filter: { balanceDue: true, travelTo: "2026-12-31", search: "Meera" }, format: "xlsx" },
      ]);
    });
    expect(await within(dialog).findByText("Preparing 7 quotes…")).toBeVisible();
  });

  it("opens the export's page from the bell, saying what it holds, with Download", async () => {
    stubApi({ "quoteExports.get": { data: ready }, "quoteExports.downloadLink": { data: link } });
    renderScreen(<QuoteExportScreen exportId={exportId} />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", routes.quotes);
    expect(await screen.findByText("Sent · Travel until 31 Dec")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: exportWords.dialog.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
  });
});
