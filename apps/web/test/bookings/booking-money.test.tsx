// A booking holds all its money (bookings revamp, Task 7): the paid bar and each due's pill, Record payment (from the money or
// from Needs you, with that due's amount), receipts, void and the invoice for whoever records payments and nothing of that
// without, Costs and profit only with accounts, proofs as picture tiles, and a booked quote pointing here.
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingScreen } from "@/bookings/booking-screen";
import { ProofCard } from "@/bookings/proof-card";
import { messages } from "@/i18n/messages";
import { QuoteScreen } from "@/quotes/quote-screen";
import { inputsTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { paidSubscription } from "../organization/api";
import { aQuote } from "../quotes/quote";
import { aBooking } from "./booking";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const words = messages.bookings;
const treasurer = member({ permissions: ["bookings:view", "bookings:edit", "quotes:record_payments"] });
const viewer = member({ permissions: ["bookings:view", "bookings:edit"] });
const due = (id: string, label: string, amountPaise: number, dueOn: string, state: "paid" | "due" | "overdue") => ({
  id: `0199a000-0000-7000-8000-0000000000${id}`,
  label,
  amountPaise,
  dueOn,
  paid: state === "paid",
  state,
});
const owing = aBooking({
  totalPaise: 5_000_000,
  paidPaise: 1_000_000,
  balancePaise: 4_000_000,
  installments: [
    due("d1", "Advance", 1_000_000, "2026-11-10", "paid"),
    due("d2", "Second", 1_500_000, "2026-11-20", "overdue"),
    due("d3", "Balance", 2_500_000, "2026-12-25", "due"),
  ],
  payments: [
    {
      id: "0199a000-0000-7000-8000-0000000000p1",
      amountPaise: 1_000_000,
      receivedOn: "2026-11-10",
      method: "upi",
      reference: "UTR1",
      recordedBy: null,
      receiptDocumentId: null,
    },
  ],
});
const open = async (
  booking = owing,
  me = treasurer,
  extra: Record<string, unknown> = {},
  subscription?: typeof paidSubscription,
) => {
  const api = stubApi({ "bookings.get": { data: booking }, ...extra });
  renderScreen(<BookingScreen bookingId={booking.id} />, {
    me,
    width: "wide",
    ...(subscription === undefined ? {} : { subscription }),
  });
  await screen.findByRole("heading", { level: 1, name: booking.title });
  return api;
};
const money = () => screen.getByRole("region", { name: words.payments.title });

describe("a booking's money", () => {
  it("shows the paid bar and each payment due's pill: Paid, Overdue, Due with its day", async () => {
    await open();
    expect(within(money()).getByRole("progressbar", { name: "Paid ₹10,000 of ₹50,000" })).toBeVisible();
    const rows = within(money()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Paid");
    expect(rows[1]).toHaveTextContent("Overdue");
    expect(rows[2]).toHaveTextContent("Due 25 Dec");
  });

  it("records a payment from the money, for what is owed next", async () => {
    const api = await open(owing, treasurer, { "quotes.recordPayment": { data: null } });
    await userEvent.click(within(money()).getByRole("button", { name: words.payments.recordPayment }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("15,000");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.quotes.money.save }));
    await vi.waitFor(() => {
      expect(api.calls).toContain("quotes.recordPayment");
    });
    expect(inputsTo("quotes.recordPayment")).toEqual([
      expect.objectContaining({ quoteId: owing.quoteId, amountPaise: 1_500_000 }),
    ]);
  });

  it("records a payment from Needs you with the overdue due's amount", async () => {
    await open();
    const needs = screen.getByRole("region", { name: words.needsYou.title });
    await userEvent.click(within(needs).getByRole("button", { name: words.needsYou.recordPayment }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("15,000");
  });

  it("voids a payment through the quote's own procedure, with receipts and the invoice beside it", async () => {
    const api = await open(owing, treasurer, { "quotes.voidPayment": { data: null } });
    await userEvent.click(within(money()).getByRole("button", { name: /Void the payment/ }));
    const asking = await screen.findByRole("alertdialog");
    await userEvent.click(within(asking).getByRole("button", { name: messages.quotes.money.void }));
    await vi.waitFor(() => {
      expect(api.calls).toContain("quotes.voidPayment");
    });
    expect(inputsTo("quotes.voidPayment")).toEqual([{ paymentId: owing.payments[0]?.id }]);
    expect(within(money()).getByRole("button", { name: messages.quotes.money.receipt })).toBeVisible();
    expect(within(money()).getByRole("button", { name: messages.quotes.quote.issueInvoice })).toBeVisible();
  });

  it("is read-only without quotes:record_payments", async () => {
    await open(owing, viewer);
    expect(within(money()).queryByRole("button", { name: words.payments.recordPayment })).toBeNull();
    expect(within(money()).queryByRole("button", { name: messages.quotes.money.receipt })).toBeNull();
    expect(within(money()).queryByRole("button", { name: messages.quotes.quote.issueInvoice })).toBeNull();
    expect(within(money()).queryByRole("button", { name: /Void the payment/ })).toBeNull();
    expect(screen.queryByRole("region", { name: words.needsYou.title })?.textContent ?? "").not.toContain(
      words.needsYou.recordPayment,
    );
  });

  it("names the issued invoice as a tax invoice", async () => {
    await open({ ...owing, invoiceDocumentId: "0199a000-0000-7000-8000-0000000000i1" });
    expect(within(money()).getByRole("button", { name: messages.quotes.quote.invoice })).toBeVisible();
  });

  it("shows Costs and profit only with accounts:view on a plan with accounts", async () => {
    const accounts = member({
      permissions: ["bookings:view", "bookings:edit", "quotes:record_payments", "accounts:view"],
    });
    const costs = {
      "finance.costs": {
        data: { revenuePaise: 0, costPaise: 0, profitPaise: 0, marginBasisPoints: null, costs: [], suppliers: [] },
      },
    };
    await open(owing, accounts, costs, { ...paidSubscription, modules: ["accounts"] });
    expect(await screen.findByText(messages.finance.costs.title)).toBeVisible();
  });

  it("shows no Costs without accounts:view, or on a plan without accounts", async () => {
    await open();
    expect(screen.queryByText(messages.finance.costs.title)).toBeNull();
    cleanup();
    const accounts = member({ permissions: ["bookings:view", "bookings:edit", "accounts:view"] });
    await open(owing, accounts);
    expect(screen.queryByText(messages.finance.costs.title)).toBeNull();
  });

  it("reads a cancelled booking's charge, with no Record payment", async () => {
    await open({ ...owing, status: "cancelled", installments: [] });
    expect(within(money()).queryByRole("button", { name: words.payments.recordPayment })).toBeNull();
    expect(within(money()).queryByText("Overdue")).toBeNull();
  });
});

describe("proofs from the chat", () => {
  it("shows a picture as a tile and a PDF as a file tile, each loading its signed link", async () => {
    const ids = ["0199a000-0000-7000-8000-0000000000f1", "0199a000-0000-7000-8000-0000000000f2"];
    const api = stubApi({
      "inbox.mediaUrl": (input) => ({
        data:
          (input as { messageId: string }).messageId === ids[0]
            ? { url: "https://files.example.test/a.jpg", fileName: null, contentType: "image/jpeg", sizeBytes: 10 }
            : {
                url: "https://files.example.test/b.pdf",
                fileName: null,
                contentType: "application/pdf",
                sizeBytes: 10,
              },
      }),
    });
    renderScreen(<ProofCard booking={aBooking({ proofMessageIds: ids })} />, { me: treasurer, width: "wide" });
    const tiles = await screen.findAllByRole("button", { name: /Proof \d/ });
    expect(tiles).toHaveLength(2);
    await vi.waitFor(() => {
      expect(tiles[0]?.querySelector("img")).toHaveAttribute("src", "https://files.example.test/a.jpg");
    });
    await vi.waitFor(() => {
      expect(api.calls.filter((call) => call === "inbox.mediaUrl")).toHaveLength(2);
    });
    expect(tiles[1]?.querySelector("img")).toBeNull();
  });
});

describe("a booked quote", () => {
  const quoteId = "0199a000-0000-7000-8000-0000000000a1";
  it("points to its booking in place of its money", async () => {
    stubApi({
      "quotes.get": {
        data: aQuote({ status: "accepted", booking: { id: owing.id, number: "BK-2026-0007" } }),
      },
    });
    renderScreen(<QuoteScreen quoteId={quoteId} />, { me: treasurer, width: "wide" });
    expect(await screen.findByText(/This quote is booking BK-2026-0007/)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.quotes.money.openBooking })).toHaveAttribute(
      "href",
      `/bookings/${owing.id}`,
    );
    expect(screen.queryByRole("button", { name: messages.quotes.money.recordPayment })).toBeNull();
  });

  it("keeps its money, with Record payment, while it is only sent", async () => {
    stubApi({ "quotes.get": { data: aQuote({ status: "sent", booking: null }) } });
    renderScreen(<QuoteScreen quoteId={quoteId} />, { me: treasurer, width: "wide" });
    expect(await screen.findByRole("button", { name: messages.quotes.money.recordPayment })).toBeVisible();
  });
});
