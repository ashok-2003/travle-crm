// A booking's page leads with its trip: the title as the heading, the date with its weekday, the people, the customer as a
// link, the number, the status pill and the departure link; its actions are one row (WhatsApp, Trip link with Copy, More);
// Needs you lists what waits, each with its action, and is absent when nothing waits; the consent to trip updates is behind
// the Reminders menu and a confirmation; a travel date is added or changed in a dialog.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingActions } from "@/bookings/booking-actions";
import { BookingScreen } from "@/bookings/booking-screen";
import { NeedsYou } from "@/bookings/needs-you";
import { RemindersCard } from "@/bookings/reminders-card";
import { messages } from "@/i18n/messages";
import { inputsTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aBooking } from "./booking";

const words = messages.bookings;
const editor = member({ permissions: ["bookings:view", "bookings:edit", "quotes:record_payments"] });
const dues = (state: "paid" | "due" | "overdue") => [
  {
    id: "0199a000-0000-7000-8000-0000000000d1",
    label: "Advance",
    amountPaise: 1_500_000,
    dueOn: "2026-11-20",
    paid: false,
    state,
  },
];

describe("a booking's header", () => {
  it("leads with the trip's title, then its date with the weekday and its people, whose it is and its number", async () => {
    stubApi({ "bookings.get": { data: aBooking() } });
    renderScreen(<BookingScreen bookingId={aBooking().id} />, { me: editor, width: "wide" });
    expect(await screen.findByRole("heading", { level: 1, name: "Kerala backwaters" })).toBeVisible();
    expect(screen.getByText("Fri 4 Dec · 2 people")).toBeVisible();
    expect(screen.getByRole("link", { name: "Meera Iyer" })).toHaveAttribute(
      "href",
      expect.stringContaining("/leads/"),
    );
    expect(screen.getByText("BK-2026-0001")).toBeVisible();
    expect(screen.getByText(words.status.confirmed)).toBeVisible();
  });

  it("links the departure of a group trip", async () => {
    const departure = { id: "0199a000-0000-7000-8000-0000000000e1", title: "Spiti batch", startDate: "2026-12-04" };
    stubApi({ "bookings.get": { data: aBooking({ departure }) } });
    renderScreen(<BookingScreen bookingId={aBooking().id} />, { me: editor, width: "wide" });
    expect(await screen.findByRole("link", { name: /Spiti batch/ })).toHaveAttribute(
      "href",
      expect.stringContaining(departure.id),
    );
  });
});

describe("a booking's actions", () => {
  const row = () => screen.getByRole("group", { name: words.actions.label });
  const names = () =>
    [...row().querySelectorAll("button, a")].map((one) => one.getAttribute("aria-label") ?? one.textContent);

  it("is one row: WhatsApp, Trip link, then Copy once the link is made, and More", async () => {
    stubApi({ "bookings.tripLink": { data: { path: "/p/token-1" } } });
    renderScreen(<BookingActions booking={aBooking()} />, { me: editor, width: "wide" });
    expect(names()).toEqual([words.actions.sendWhatsapp, words.actions.makeLink, words.actions.more]);
    await userEvent.click(screen.getByRole("button", { name: words.actions.makeLink }));
    const link = await screen.findByRole("link", { name: words.actions.tripLink });
    expect(link).toHaveAttribute("href", "/p/token-1");
    expect(names()).toEqual([
      words.actions.sendWhatsapp,
      words.actions.tripLink,
      words.actions.copyLink,
      words.actions.more,
    ]);
  });

  it("holds Cancel booking in the More menu, with the travel date to change", async () => {
    stubApi({});
    renderScreen(<BookingActions booking={aBooking()} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.actions.more }));
    expect(await screen.findByRole("menuitem", { name: words.actions.changeDate })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: words.actions.cancel })).toBeVisible();
  });

  it("offers no travel date to change on a booking that follows its departure", async () => {
    stubApi({});
    const departure = { id: "0199a000-0000-7000-8000-0000000000e1", title: "Spiti batch", startDate: "2026-12-04" };
    renderScreen(<BookingActions booking={aBooking({ departure })} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.actions.more }));
    expect(await screen.findByRole("menuitem", { name: words.actions.cancel })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: words.actions.changeDate })).toBeNull();
  });

  it("sends the new travel date from the menu", async () => {
    const api = stubApi({ "bookings.setTravelDate": { data: null } });
    renderScreen(<BookingActions booking={aBooking()} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.actions.more }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.actions.changeDate }));
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByLabelText(words.travelDate.field);
    await userEvent.clear(field);
    await userEvent.type(field, "30/12/2026");
    await userEvent.click(within(dialog).getByRole("button", { name: words.travelDate.submit }));
    await vi.waitFor(() => {
      expect(inputsTo("bookings.setTravelDate")).toEqual([{ bookingId: aBooking().id, startDate: "2026-12-30" }]);
    });
    expect(api.calls).toContain("bookings.setTravelDate");
  });
});

describe("Needs you", () => {
  const box = () => screen.queryByRole("region", { name: words.needsYou.title });
  const inBox = () => within(screen.getByRole("region", { name: words.needsYou.title }));
  const record = vi.fn();

  it("is absent when nothing waits", () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking()} onRecordPayment={record} />, { me: editor, width: "wide" });
    expect(box()).toBeNull();
  });

  it("lists a booking waiting to be confirmed, with Confirm", () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking({ status: "requested" })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    expect(inBox().getByRole("button", { name: words.confirm.open })).toBeVisible();
  });

  it("lists an overdue payment due with Record payment, and a due one not at all", async () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking({ installments: dues("overdue") })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    expect(inBox().getByText(/Advance, ₹15,000, is overdue/)).toBeVisible();
    await userEvent.click(inBox().getByRole("button", { name: words.needsYou.recordPayment }));
    expect(record).toHaveBeenCalledWith("0199a000-0000-7000-8000-0000000000d1");
  });

  it("does not list a payment that is only due", () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking({ installments: dues("due") })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    expect(box()).toBeNull();
  });

  it("lists payments to check, proofs, and details missing, each with its way to the part of the page", () => {
    stubApi({});
    renderScreen(
      <NeedsYou
        booking={aBooking({
          pendingClaims: 2,
          proofMessageIds: ["0199a000-0000-7000-8000-0000000000f1"],
          travellersComplete: 1,
        })}
        onRecordPayment={record}
      />,
      { me: editor, width: "wide" },
    );
    const inside = inBox();
    expect(inside.getByText("2 payments to check against your bank")).toBeVisible();
    expect(
      inside.getAllByRole("link", { name: words.needsYou.check }).map((link) => link.getAttribute("href")),
    ).toEqual(["#money", "#proof"]);
    expect(inside.getByText("1 of 2 travellers' details are filled in")).toBeVisible();
    expect(inside.getByRole("link", { name: words.needsYou.fillIn })).toHaveAttribute("href", "#travellers");
  });

  it("asks for the travel date of a booking that has none, in a dialog", async () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking({ startDate: null, endDate: null })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    await userEvent.click(inBox().getByRole("button", { name: words.travelDate.add }));
    expect(await screen.findByLabelText(words.travelDate.field)).toBeVisible();
  });

  it("does not ask for a travel date on a booking that follows its departure", () => {
    stubApi({});
    const departure = { id: "0199a000-0000-7000-8000-0000000000e1", title: "Spiti batch", startDate: "2026-12-04" };
    renderScreen(<NeedsYou booking={aBooking({ startDate: null, departure })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    expect(box()).toBeNull();
  });

  it("waits on nothing once cancelled", () => {
    stubApi({});
    renderScreen(<NeedsYou booking={aBooking({ status: "cancelled", pendingClaims: 1 })} onRecordPayment={record} />, {
      me: editor,
      width: "wide",
    });
    expect(box()).toBeNull();
  });
});

describe("Reminders", () => {
  it("records the traveller's agreement only from the menu, after a confirmation", async () => {
    stubApi({ "bookings.recordTripUpdates": { data: null } });
    renderScreen(<RemindersCard booking={aBooking()} />, { me: editor, width: "wide" });
    expect(screen.queryByRole("button", { name: words.reminders.recordAgreed })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: words.reminders.more }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.reminders.recordAgreed }));
    const asking = await screen.findByRole("alertdialog", { name: words.reminders.recordTitle });
    expect(inputsTo("bookings.recordTripUpdates")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: words.reminders.recordConfirm }));
    await vi.waitFor(() => {
      expect(inputsTo("bookings.recordTripUpdates")).toEqual([{ bookingId: aBooking().id }]);
    });
  });
});
