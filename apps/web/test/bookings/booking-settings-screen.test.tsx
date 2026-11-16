// The booking settings' payment messages: a text with a blank a payment can't fill is refused before saving, with the
// four blanks it may use named.
import type { BookingSettingsView } from "@travel-crm/contracts/bookings";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingSettingsScreen } from "@/bookings/booking-settings-screen";
import { messages } from "@/i18n/messages";
import { renderAs, screenIs } from "../organization/render";
import { stubCalls } from "../today/api";

const words = messages.bookings.settings;

const saved: BookingSettingsView = {
  advanceBasisPoints: 3_000,
  balanceDaysBefore: 15,
  detailsCutoffDays: 3,
  defaultLevel: "basic",
  balanceReminderDays: [3, 0],
  detailsReminderDays: 10,
  balanceTemplateId: null,
  balanceParams: [],
  detailsTemplateId: null,
  detailsParams: [],
  paymentConfirmedText: "Thank you {name}! We have received {amount}.",
  paymentNotFoundText: "Hi {name}, we could not find your payment of {amount} yet.",
  paymentConfirmedTemplateId: null,
  paymentConfirmedParams: [],
  paymentNotFoundTemplateId: null,
  paymentNotFoundParams: [],
  reportingTemplateId: null,
  reportingParams: [],
  feedbackTemplateId: null,
  feedbackParams: [],
  packingList: "",
  emergencyName: "",
  emergencyPhone: "",
  bankDetails: "",
  cancellationNotes: "",
  googleReviewUrl: "",
  rules: [{ daysBeforeMin: 0, chargeBasisPoints: 10_000 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BookingSettingsScreen", () => {
  it("names the four blanks when a payment message uses another", async () => {
    const api = stubCalls((call) =>
      call.path === "bookings.settings"
        ? { data: saved }
        : call.path === "whatsappTemplates.sendable"
          ? { data: { items: [] } }
          : { status: 404 },
    );
    screenIs("wide");
    renderAs(<BookingSettingsScreen />);
    const confirmed = await screen.findByLabelText(words.paymentMessages.confirmedText);
    fireEvent.change(confirmed, { target: { value: "Hi {name}, your agent {agent} says thanks" } });
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    expect(
      await screen.findByText("A payment message can use only these blanks: {name}, {amount}, {trip}, {date}."),
    ).toBeVisible();
    expect(api.calls.some((call) => call.path === "bookings.saveSettings")).toBe(false);
  });
});
