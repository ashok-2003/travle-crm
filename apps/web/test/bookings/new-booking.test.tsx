// New booking on the Bookings list: shown only to a member who may edit bookings and quotes; a centred popup that chooses the
// lead, then the trip, people and total; Create booking sends one request, holds the popup open while it saves, and opens the
// booking.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingsScreen } from "@/bookings/bookings-screen";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { address } from "../leads/navigation";
import { aLead, aListItem, aPage } from "../leads/records";
import { inputsTo, owner, renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const words = messages.bookings.list;
const bookingId = "0199b000-0000-7000-8000-000000000009";
const answers = {
  "bookings.page": { data: { items: [], total: 0 } },
  "bookings.salespeople": { data: [] },
  "leads.list": aPage([aListItem()]),
  "leads.get": { data: aLead() },
  "quotes.packages": { data: [] },
  "quotes.settings": { data: { defaultTaxRateBasisPoints: 500 } },
};

describe("New booking", () => {
  it("is for a member who may create bookings and create and edit quotes", async () => {
    stubApi(answers);
    const bookingsOnly = member({ permissions: ["bookings:view", "bookings:create", "quotes:create"] });
    renderScreen(<BookingsScreen />, { me: bookingsOnly, width: "wide" });
    await screen.findByText(words.title);
    expect(screen.queryByRole("button", { name: words.new })).toBeNull();
  });

  it("makes the booking in one request, stays open while it saves, and opens it", async () => {
    address.set("/bookings");
    const held = heldAnswer({ data: { bookingId } });
    stubApi({ ...answers, "bookings.create": held.answer });
    renderScreen(<BookingsScreen />, { me: owner, width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: words.new }));
    await userEvent.click(await screen.findByText("Rahul Sharma", { selector: "span" }));
    await userEvent.type(await screen.findByLabelText(words.newBooking.tripTitle), "Goa 4 nights");
    await userEvent.type(screen.getByLabelText(words.newBooking.total), "1,05,000");
    await userEvent.click(screen.getByRole("button", { name: words.newBooking.submit }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    held.release();
    await waitFor(() => {
      expect(address.href).toContain(bookingId);
    });
    expect(inputsTo("bookings.create")).toEqual([
      expect.objectContaining({ title: "Goa 4 nights", totalPaise: 105_000_00, packageId: null, departureId: null }),
    ]);
  });
});
