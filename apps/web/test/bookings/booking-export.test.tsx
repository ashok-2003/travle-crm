// The Bookings list's Export (bookings revamp, 2026-11-27): in the list's toolbar, a dialog saying what the file holds as
// the list shows it (its status chip, Filters and search) and asking for Excel or CSV with that filter; and the export's
// page, where the bell leads, downloading the file.
import type { BookingExportDetail, BookingTableRow } from "@travel-crm/contracts/bookings";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingExportScreen } from "@/bookings/export/booking-export-screen";
import { BookingsScreen } from "@/bookings/bookings-screen";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { forgetTabValues, keepTabValue } from "@/lib/tab-storage";
import { stubApi } from "../support/api-stub";
import { address } from "../leads/navigation";
import { inputsTo, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.bookings.export;
const exportWords = messages.exports;
// Friday 27 November 2026 in India: December's days show without their year.
const NOW = new Date("2026-11-27T05:30:00Z");
const exportId = "0199e7a0-0000-7000-8000-0000000000e3";
const salesperson = "0199a000-0000-7000-8000-0000000000a2";
const link = { url: "https://files.example/bookings.xlsx", expiresAt: "2099-10-20T05:05:00.000Z" };

const row: BookingTableRow = {
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
  paidPaise: 0,
  balancePaise: 150_000_00,
  travellersTotal: 3,
  travellersComplete: 0,
  pendingClaims: 0,
  refundDuePaise: 0,
  paymentState: "overdue",
  adults: 2,
  children: 1,
  ownerName: "Ravi Kumar",
};

const ready: BookingExportDetail = {
  id: exportId,
  kind: "bookings",
  format: "xlsx",
  status: "ready",
  failureReason: null,
  rowsTotal: 12,
  rowsDone: 12,
  file: { fileName: "bookings-2026-11-27-1100.xlsx", sizeBytes: 9_216 },
  createdAt: "2026-11-27T05:30:00.000Z",
  readyAt: "2026-11-27T05:31:00.000Z",
  expiresAt: "2026-11-28T05:31:00.000Z",
  filter: { status: "confirmed", payment: "overdue", ownerUserId: salesperson },
  salespersonName: "Ravi Kumar",
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

describe("the Bookings list's Export", () => {
  it("asks for the list as it is on screen, its chip, Filters and search included", async () => {
    address.set(`/bookings?status=confirmed&from=2026-12-01&salesperson=${salesperson}&payment=overdue`);
    keepTabValue("bookings.search", "Meera");
    stubApi({
      "bookings.page": { data: { items: [row], total: 1 } },
      "bookings.salespeople": { data: [{ userId: salesperson, name: "Ravi Kumar" }] },
      "bookingExports.start": { data: { exportId } },
      "bookingExports.get": { data: { ...ready, status: "making", rowsDone: 0, file: null, readyAt: null } },
    });
    renderScreen(<BookingsScreen />, { width: "wide" });
    await screen.findByRole("table", { name: messages.bookings.list.bookings });
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    expect(
      await within(dialog).findByText(
        'Confirmed · Travel from 1 Dec · Salesperson: Ravi Kumar · Payment: Overdue · matching "Meera"',
      ),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole("radio", { name: exportWords.formats.csv }));
    await userEvent.click(within(dialog).getByRole("button", { name: exportWords.dialog.prepare }));
    await waitFor(() => {
      expect(inputsTo("bookingExports.start")).toEqual([
        {
          filter: {
            status: "confirmed",
            travelFrom: "2026-12-01",
            ownerUserId: salesperson,
            payment: "overdue",
            search: "Meera",
          },
          format: "csv",
        },
      ]);
    });
    expect(await within(dialog).findByText("Preparing 12 bookings…")).toBeVisible();
  });

  it("says what an export of every booking holds", async () => {
    address.set("/bookings");
    stubApi({
      "bookings.page": { data: { items: [row], total: 1 } },
      "bookings.salespeople": { data: [] },
    });
    renderScreen(<BookingsScreen />, { width: "phone" });
    await userEvent.click(await screen.findByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    expect(within(dialog).getByText(words.holds.all)).toBeVisible();
  });

  it("opens the export's page from the bell, saying what it holds, with Download", async () => {
    stubApi({ "bookingExports.get": { data: ready }, "bookingExports.downloadLink": { data: link } });
    renderScreen(<BookingExportScreen exportId={exportId} />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", routes.bookings);
    expect(await screen.findByText("Confirmed · Salesperson: Ravi Kumar · Payment: Overdue")).toBeVisible();
    expect(screen.getByText("bookings-2026-11-27-1100.xlsx")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: exportWords.dialog.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
  });
});
