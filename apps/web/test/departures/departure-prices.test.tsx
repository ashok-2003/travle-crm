// A departure of a trip shows each room's price for its first day, and its Change form leaves out the destination and
// leaves an empty price meaning "the season's".
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { describe, expect, it } from "vitest";
import { DepartureScreen } from "@/departures/departure-screen";
import { DepartureFormDialog } from "@/departures/departure-form-dialog";
import { messages } from "@/i18n/messages";
import { lastInputTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { aPackage, noPrices } from "../packages/detail";

const packageId = aPackage().id;
const departureId = "0190a000-0000-7000-8000-0000000000d1";
const detail = {
  id: departureId,
  title: "Kedarnath, 3 Nov",
  destinationName: null,
  startDate: "2027-11-03",
  endDate: "2027-11-08",
  pricePaise: null,
  status: "open" as const,
  state: "open" as const,
  seatsTotal: 20,
  sold: 0,
  held: 0,
  free: 20,
  overbookedBy: 0,
  destinationId: null,
  cutoffOn: null,
  notes: "",
  templateId: packageId,
  prices: noPrices,
  cancelledReason: null,
  bookings: [],
  holds: [],
  waitlist: [],
};
const onTheDay = (changes: Partial<CalendarDeparture> = {}): CalendarDeparture => ({
  departureId,
  startDate: "2027-11-03",
  endDate: "2027-11-08",
  status: "open",
  seatsTotal: 20,
  seatsSold: 0,
  seatsHeld: 0,
  seatsFree: 20,
  prices: { ...noPrices, double: 720_000, triple: 650_000 },
  ownPrices: noPrices,
  priceSource: "season",
  seasonLabel: "Regular",
  ...changes,
});

describe("the departure's page", () => {
  it("shows each room's price for its first day and where it comes from", async () => {
    const api = stubApi({
      "departures.get": { data: detail },
      "departures.calendar": { data: [onTheDay()] },
      "packages.get": { data: aPackage({ kind: "group", roomTypes: ["double", "triple"] }) },
    });
    renderScreen(<DepartureScreen departureId={departureId} />, { width: "wide" });
    expect(await screen.findByText(/Double ₹7,200/)).toBeTruthy();
    expect(screen.getByText(/Triple ₹6,500/)).toBeTruthy();
    expect(screen.getByText(/Regular/)).toBeTruthy();
    expect(api.calls).toContain("departures.calendar");
  });

  it("says when the prices are the departure's own", async () => {
    stubApi({
      "departures.get": { data: detail },
      "departures.calendar": {
        data: [onTheDay({ priceSource: "departure", seasonLabel: null, ownPrices: { ...noPrices, double: 720_000 } })],
      },
      "packages.get": { data: aPackage({ kind: "group", roomTypes: ["double"] }) },
    });
    renderScreen(<DepartureScreen departureId={departureId} />, { width: "wide" });
    expect(await screen.findByText(messages.departures.page.ownPrices)).toBeTruthy();
  });
});

describe("the Change form of a trip's departure", () => {
  it("has no Destination, shows the season's price in an empty box and sends it empty", async () => {
    stubApi({
      "departures.calendar": { data: [onTheDay()] },
      "packages.get": { data: aPackage({ kind: "group", roomTypes: ["double", "triple"] }) },
      "departures.update": { data: null },
    });
    renderScreen(<DepartureFormDialog departure={detail} trigger={{ label: "Change" }} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox", { name: messages.departures.form.destination })).toBeNull();
    expect(within(dialog).queryByText(messages.departures.form.destination)).toBeNull();
    const double = await within(dialog).findByRole("textbox", { name: "Double" });
    await waitFor(() => {
      expect(double).toHaveAttribute("placeholder", "7,200");
    });
    expect(double).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.departures.form.save }));
    await waitFor(() => {
      expect(lastInputTo("departures.update")).toBeDefined();
    });
    expect(lastInputTo("departures.update")).toMatchObject({
      prices: noPrices,
      destinationId: null,
      templateId: packageId,
    });
  });
});
