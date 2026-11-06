// The bookings the AI took, on a lead's page: on a plan with bookings the payment is confirmed on Payments to check, so the
// panel links there (or says who does it) instead of confirming; without bookings it confirms here as before.
import type { AiBooking } from "@travel-crm/contracts/ai";
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadBookings } from "@/ai/lead-bookings";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";
import { stubCalls } from "../today/api";

const words = messages.ai.bookings;
const leadId = "0199e7a0-0000-7000-8000-0000000000a1";
const booking: AiBooking = {
  id: "0199e7a0-0000-7000-8000-000000000001",
  leadId,
  conversationId: "0199e7a0-0000-7000-8000-0000000000c1",
  summary: "Manali 5N for 4",
  details: { package: "Manali 5N", dates: "12 Dec", travellers: "4", pickup: "Delhi", amount: "₹40,000" },
  status: "proof_received",
  bookingId: null,
  bookingNumber: null,
  proofs: [],
  createdAt: "2026-11-05T04:30:00.000Z",
};

function renderPanel(modules: PlanModule[], permissions?: string[]) {
  stubCalls((call) => (call.path === "ai.bookingsForLead" ? { data: [booking] } : { status: 404 }));
  renderWithApi(
    <LeadBookings leadId={leadId} />,
    newQueryClient({ ...paidSubscription, modules }),
    permissions === undefined ? member({ isOwner: true }) : member({ permissions }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadBookings", () => {
  it("on a plan with bookings, links to Payments to check instead of confirming", async () => {
    renderPanel(["crm", "bookings"]);
    expect(await screen.findByRole("link", { name: words.confirmOnPayments })).toHaveAttribute("href", routes.payments);
    expect(screen.queryByRole("button", { name: words.confirm })).toBeNull();
    expect(screen.getByRole("button", { name: words.cancel })).toBeVisible();
  });

  it("for someone who can't check payments, says who confirms it", async () => {
    renderPanel(["crm", "bookings"], ["leads:view", "leads:edit"]);
    expect(await screen.findByText(words.confirmedOnPayments)).toBeVisible();
    expect(screen.queryByRole("link", { name: words.confirmOnPayments })).toBeNull();
    expect(screen.queryByRole("button", { name: words.confirm })).toBeNull();
  });

  it("without bookings, confirms here as before", async () => {
    renderPanel(["crm"]);
    expect(await screen.findByRole("button", { name: words.confirm })).toBeVisible();
    expect(screen.queryByRole("link", { name: words.confirmOnPayments })).toBeNull();
  });
});
