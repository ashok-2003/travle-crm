// Payments to check (plan 3): the list shows each kind with its amounts and a screenshot button; Confirm starts at what
// the customer claimed or the advance code worked out (never the AI's own note) and sends the amount the person typed; Not received tells the customer unless unticked; and the toast
// says how the customer was told.
import type { PaymentToCheck } from "@travel-crm/contracts/bookings";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { PaymentsScreen } from "@/payments/payments-screen";
import { renderAs, screenIs } from "../organization/render";
import { member } from "../support/members";
import { stubCalls, type Call, type Reply } from "../today/api";

const words = messages.payments;
const id = (last: string) => `0199e7a0-0000-7000-8000-0000000000${last}`;

const base: PaymentToCheck = {
  kind: "claim",
  id: id("01"),
  createdAt: "2026-11-05T04:30:00.000Z",
  waitingSince: "2026-11-05T04:30:00.000Z",
  person: { name: "Priya Nair", leadId: id("a1") },
  trip: "Spiti 6 days",
  date: "2026-12-20",
  expectedPaise: 2_000_000,
  claimedPaise: 1_000_000,
  aiNote: null,
  reference: "UTR1",
  screenshot: { kind: "claim_file", id: id("f1") },
  conversationId: null,
  bookingId: id("b1"),
};
const claim = base;
const aiBooking: PaymentToCheck = {
  ...base,
  kind: "ai_booking",
  id: id("02"),
  person: { name: "Rahul Sharma", leadId: id("a2") },
  trip: "Manali 5N",
  date: null,
  expectedPaise: 1_800_000,
  claimedPaise: null,
  reference: null,
  screenshot: { kind: "chat_message", id: id("m1") },
  conversationId: id("c1"),
  bookingId: null,
};
const proof: PaymentToCheck = {
  ...base,
  kind: "proof",
  id: id("03"),
  person: { name: "Kiran Joshi", leadId: null },
  trip: null,
  date: null,
  expectedPaise: null,
  claimedPaise: null,
  reference: null,
  screenshot: { kind: "chat_message", id: id("m2") },
  conversationId: id("c2"),
  bookingId: null,
};

let waiting: PaymentToCheck[];
let told: "sent" | "template" | "task" | "none";

function answer(call: Call): Reply {
  if (call.path === "paymentsToCheck.list") return { data: { items: waiting, nextCursor: null } };
  if (call.path === "paymentsToCheck.screenshotLink") return { data: { url: "https://files.test/screenshot.png" } };
  if (call.path === "paymentsToCheck.preview") {
    const asked = call.input as { outcome: string; amountPaise?: number };
    return asked.outcome === "confirm"
      ? { data: { way: "message", text: `Thank you! We have received ${String(asked.amountPaise ?? "it")}.` } }
      : { data: { way: "task" } };
  }
  if (call.path === "paymentsToCheck.confirm" || call.path === "paymentsToCheck.refuse") {
    const decided = (call.input as { id: string }).id;
    waiting = waiting.filter((one) => one.id !== decided);
    return { data: { told } };
  }
  return { status: 404, reason: "NOT_FOUND" };
}

function renderPayments(me?: Parameters<typeof renderAs>[1]) {
  const api = stubCalls(answer);
  renderAs(
    <>
      <PaymentsScreen />
      <Toaster />
    </>,
    me,
  );
  return api;
}

const decisions = (calls: Call[], path: string) => calls.filter((call) => call.path === path).map((call) => call.input);

beforeEach(() => {
  screenIs("wide");
  waiting = [claim, aiBooking, proof];
  told = "sent";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PaymentsScreen", () => {
  it("lists each kind with its amounts and screenshot button", async () => {
    renderPayments();
    const claimRow = (await screen.findByRole("link", { name: "Priya Nair" })).closest("tr");
    if (claimRow === null) throw new Error("no row");
    expect(within(claimRow).getByText("Spiti 6 days · 20 Dec")).toBeVisible();
    expect(within(claimRow).getByText("Expected ₹20,000")).toBeVisible();
    expect(within(claimRow).getByText("Says ₹10,000")).toBeVisible();
    expect(within(claimRow).getByText("Reference UTR1")).toBeVisible();
    expect(within(claimRow).getByText(words.kinds.claim)).toBeVisible();
    expect(within(claimRow).getByRole("button", { name: "See screenshot of Priya Nair's payment" })).toBeVisible();
    expect(within(claimRow).getByRole("button", { name: "Confirm Priya Nair's payment" })).toBeVisible();
    expect(within(claimRow).getByRole("button", { name: "Priya Nair's payment not received" })).toBeVisible();

    const aiRow = screen.getByRole("link", { name: "Rahul Sharma" }).closest("tr");
    if (aiRow === null) throw new Error("no row");
    expect(within(aiRow).getByText("Expected ₹18,000")).toBeVisible();
    expect(within(aiRow).getByText(words.kinds.ai_booking)).toBeVisible();
    expect(within(aiRow).getByRole("button", { name: "See screenshot of Rahul Sharma's payment" })).toBeVisible();

    // A screenshot nobody has matched: open its chat or dismiss it, never confirm it.
    const proofRow = screen.getByText("Kiran Joshi").closest("tr");
    if (proofRow === null) throw new Error("no row");
    expect(within(proofRow).getByText(words.kinds.proof)).toBeVisible();
    expect(within(proofRow).getByRole("link", { name: "Open Kiran Joshi's chat" })).toHaveAttribute(
      "href",
      expect.stringContaining(proof.conversationId ?? ""),
    );
    expect(within(proofRow).getByRole("button", { name: "Dismiss Kiran Joshi's screenshot" })).toBeVisible();
    expect(within(proofRow).queryByRole("button", { name: /^Confirm/ })).toBeNull();
    expect(within(proofRow).getByRole("button", { name: "See screenshot of Kiran Joshi's payment" })).toBeVisible();
  });

  it("confirm is prefilled with the expected advance and sends the entered amount", async () => {
    const api = renderPayments();
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Rahul Sharma's payment" }));
    const amount = await screen.findByLabelText(words.confirm.amount);
    expect(amount).toHaveValue("18,000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "17500");
    await userEvent.type(screen.getByLabelText(words.confirm.reference), "UTR77");
    await userEvent.click(screen.getByRole("button", { name: words.confirm.submit }));
    await waitFor(() => {
      expect(decisions(api.calls, "paymentsToCheck.confirm")).toEqual([
        { kind: "ai_booking", id: aiBooking.id, amountPaise: 1_750_000, reference: "UTR77" },
      ]);
    });
    // Decided, it leaves the list, and the focus goes to the page's heading, not to nowhere.
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });
  });

  it("not received tells the customer unless unticked", async () => {
    told = "none";
    const api = renderPayments();
    await userEvent.click(await screen.findByRole("button", { name: "Priya Nair's payment not received" }));
    const tell = await screen.findByRole("checkbox", { name: words.refuse.tell });
    expect(tell).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: words.refuse.submit }));
    await waitFor(() => {
      expect(decisions(api.calls, "paymentsToCheck.refuse")).toEqual([
        { kind: "claim", id: claim.id, reason: "not_found", tell: true },
      ]);
    });

    await userEvent.click(await screen.findByRole("button", { name: "Rahul Sharma's payment not received" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: words.refuse.tell }));
    await userEvent.click(screen.getByRole("radio", { name: words.refuse.reasons.wrong_amount }));
    await userEvent.click(screen.getByRole("button", { name: words.refuse.submit }));
    await waitFor(() => {
      expect(decisions(api.calls, "paymentsToCheck.refuse")).toEqual([
        { kind: "claim", id: claim.id, reason: "not_found", tell: true },
        { kind: "ai_booking", id: aiBooking.id, reason: "wrong_amount", tell: false },
      ]);
    });
  });

  it("says how the customer was told", async () => {
    told = "task";
    renderPayments();
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Priya Nair's payment" }));
    // A claim's own reference is shown, not asked for again; the amount starts at what the customer says they paid.
    expect(await screen.findByLabelText(words.confirm.amount)).toHaveValue("10,000");
    await userEvent.click(screen.getByRole("button", { name: words.confirm.submit }));
    expect(await screen.findByText(words.told.task)).toBeVisible();
  });

  it("the confirm dialog shows what the customer gets for the amount typed", async () => {
    renderPayments();
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Rahul Sharma's payment" }));
    const amount = await screen.findByLabelText(words.confirm.amount);
    await userEvent.clear(amount);
    await userEvent.type(amount, "17500");
    expect(await screen.findByText("Thank you! We have received 1750000.")).toBeVisible();
    expect(screen.getByText(words.preview.label)).toBeVisible();
  });

  it("the refuse dialog shows how the customer is told while Tell the customer is ticked", async () => {
    renderPayments();
    await userEvent.click(await screen.findByRole("button", { name: "Rahul Sharma's payment not received" }));
    expect(await screen.findByText(words.preview.task)).toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: words.refuse.tell }));
    expect(screen.queryByText(words.preview.task)).toBeNull();
  });

  it("someone who checks payments but reads no leads or chats sees every screenshot, with no lead or chat links", async () => {
    const api = renderPayments(member({ permissions: ["bookings:view", "quotes:record_payments"] }));
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    expect(await screen.findByText("Priya Nair")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Priya Nair" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open Kiran Joshi's chat" })).toBeNull();
    for (const name of ["Priya Nair", "Rahul Sharma", "Kiran Joshi"]) {
      await userEvent.click(screen.getByRole("button", { name: `See screenshot of ${name}'s payment` }));
    }
    await waitFor(() => {
      expect(decisions(api.calls, "paymentsToCheck.screenshotLink")).toEqual([
        { kind: "claim", id: claim.id },
        { kind: "ai_booking", id: aiBooking.id },
        { kind: "proof", id: proof.id },
      ]);
    });
    await waitFor(() => {
      expect(tab.location.href).toBe("https://files.test/screenshot.png");
    });
  });

  it("an AI booking with only the AI's note starts empty and shows the note", async () => {
    waiting = [{ ...aiBooking, expectedPaise: null, aiNote: "₹4,000 advance" }];
    renderPayments();
    expect(await screen.findByText("The AI's note: ₹4,000 advance")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm Rahul Sharma's payment" }));
    expect(await screen.findByLabelText(words.confirm.amount)).toHaveValue("");
    expect(screen.getAllByText("The AI's note: ₹4,000 advance")).toHaveLength(2);
  });
});
