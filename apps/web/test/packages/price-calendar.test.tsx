// The price calendar: departures with their seats, price periods in a legend, a day's actions, and choosing a range.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackage } from "@/packages/use-packages";
import { PriceCalendar } from "@/packages/price-calendar";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { aPackage } from "./detail";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const peak = {
  id: "0190a000-0000-7000-8000-0000000000a1",
  label: "Peak",
  startsOn: "2027-10-01",
  endsOn: "2027-10-31",
  prices: { ...none, double: 1250000 },
};
const detail = aPackage({ kind: "group", roomTypes: ["double"], seasons: [peak] });
const departure = (startDate: string, changes: Partial<DepartureSummary> = {}): DepartureSummary => ({
  id: "0190a000-0000-7000-8000-0000000000d1",
  title: "Trip",
  destinationName: null,
  startDate,
  endDate: startDate,
  pricePaise: null,
  status: "open",
  state: "open",
  seatsTotal: 10,
  sold: 6,
  held: 0,
  free: 4,
  overbookedBy: 0,
  ...changes,
});
const day = (text: RegExp) => screen.getByRole("button", { name: text });

/** Stands for the trip's page: it keeps packages.get open, as the page does, so a refresh of it can be seen. */
function Page() {
  usePackage(detail.id);
  return null;
}

function show(departures: DepartureSummary[], onSelectRange = vi.fn(), me = member({ isOwner: true })) {
  renderWithApi(
    <>
      <Page />
      <PriceCalendar detail={detail} departures={departures} onSelectRange={onSelectRange} />
    </>,
    newQueryClient(),
    me,
  );
  return onSelectRange;
}

const calendarWords = messages.packages.calendar;
/** What a tapped day may offer that changes something. */
const changes = () => ({
  add: screen.queryByRole("button", { name: calendarWords.addDeparture }),
  cancel: screen.queryByRole("button", { name: messages.departures.cancelDialog.action }),
  reopen: screen.queryByRole("button", { name: calendarWords.reopen }),
  specialPrices: screen.queryByRole("button", { name: calendarWords.rangeStart }),
});

describe("PriceCalendar", () => {
  beforeEach(() => {
    screenIs("wide");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-10-10T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks each departure day with its seats left", () => {
    show([departure("2027-10-20")]);
    const button = day(/^20 Oct, 4 seats left/);
    expect(within(button).getByText("4")).toBeTruthy();
  });

  it("marks a cancelled day ahead and offers Reopen, which calls departures.reopen", async () => {
    const api = fakeApi();
    show([departure("2027-10-20", { status: "cancelled", state: "cancelled" })]);
    await userEvent.click(day(/^20 Oct, cancelled/));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.calendar.reopen }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().path).toBe("departures.reopen");
    expect(api.last().input).toEqual({ departureId: "0190a000-0000-7000-8000-0000000000d1" });
  });

  it("a day with no departure offers Add a departure for that day", async () => {
    const api = fakeApi();
    show([]);
    await userEvent.click(day(/^22 Oct/));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.calendar.addDeparture }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().path).toBe("departures.addPackageDates");
    expect(api.last().input).toEqual({ packageId: detail.id, from: "2027-10-22", to: "2027-10-22", weekdays: [] });
  });

  it("an open departure offers a link to it and Cancel", async () => {
    show([departure("2027-10-20")]);
    await userEvent.click(day(/^20 Oct, 4 seats left/));
    expect(screen.getByRole("link", { name: messages.packages.calendar.viewDeparture }).getAttribute("href")).toBe(
      "/departures/0190a000-0000-7000-8000-0000000000d1",
    );
    expect(screen.getByRole("button", { name: messages.departures.cancelDialog.action })).toBeTruthy();
  });

  it("a day before tomorrow offers nothing", async () => {
    show([]);
    await userEvent.click(day(/^5 Oct/));
    expect(screen.queryByRole("button", { name: messages.packages.calendar.addDeparture })).toBeNull();
    await userEvent.click(day(/^10 Oct/));
    expect(screen.queryByRole("button", { name: messages.packages.calendar.addDeparture })).toBeNull();
  });

  it("lists each season in the legend with its room prices", () => {
    show([]);
    const legend = screen.getByRole("list", { name: messages.packages.calendar.legendTitle });
    expect(within(legend).getByText(/Peak/)).toBeTruthy();
    expect(within(legend).getByText(/Double ₹12,500/)).toBeTruthy();
  });

  it("tapping another day moves the selection and shows that day's actions", async () => {
    const onSelectRange = show([departure("2027-10-20")]);
    await userEvent.click(day(/^22 Oct/));
    expect(screen.getByRole("button", { name: messages.packages.calendar.addDeparture })).toBeTruthy();
    await userEvent.click(day(/^20 Oct, 4 seats left/));
    expect(screen.queryByRole("button", { name: messages.packages.calendar.addDeparture })).toBeNull();
    expect(screen.getByRole("link", { name: messages.packages.calendar.viewDeparture })).toBeTruthy();
    expect(onSelectRange).not.toHaveBeenCalled();
  });

  it("Set special prices from here, then a second day, asks for special prices for that range", async () => {
    const onSelectRange = show([]);
    await userEvent.click(day(/^15 Oct/));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.calendar.rangeStart }));
    await userEvent.click(day(/^12 Oct/));
    expect(onSelectRange).toHaveBeenCalledWith({ from: "2027-10-12", to: "2027-10-15" });
  });

  it("range mode can be left without opening the dialog", async () => {
    const onSelectRange = show([]);
    await userEvent.click(day(/^15 Oct/));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.calendar.rangeStart }));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.calendar.rangeStop }));
    await userEvent.click(day(/^12 Oct/));
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: messages.packages.calendar.rangeStart })).toBeTruthy();
  });

  it("cancelling from the day's actions refreshes the package and shows the confirmation", async () => {
    const api = fakeApi();
    show([departure("2027-10-20")]);
    const loads = () => api.calls.filter((call) => call.path === "packages.get");
    await waitFor(() => {
      expect(loads()).toHaveLength(1);
    });
    loads()[0]?.answer(detail);
    await userEvent.click(day(/^20 Oct, 4 seats left/));
    await userEvent.click(screen.getByRole("button", { name: messages.departures.cancelDialog.action }));
    await userEvent.type(screen.getByRole("textbox", { name: messages.departures.cancelDialog.reason }), "Road shut");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.departures.cancelDialog.action }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "departures.cancel")).toBe(true);
    });
    api.calls.find((call) => call.path === "departures.cancel")?.answer({});
    await waitFor(() => {
      expect(loads()).toHaveLength(2);
    });
    loads()[1]?.answer(detail);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(messages.departures.cancelDialog.cancelled);
    });
  });

  it("a member who may only look taps a day and sees no actions, only the way to the departure", async () => {
    show(
      [
        departure("2027-10-20"),
        departure("2027-10-24", {
          id: "0190a000-0000-7000-8000-0000000000d2",
          status: "cancelled",
          state: "cancelled",
        }),
      ],
      vi.fn(),
      member({ permissions: ["quotes:view", "departures:view"] }),
    );
    await userEvent.click(day(/^22 Oct/));
    expect(changes()).toEqual({ add: null, cancel: null, reopen: null, specialPrices: null });
    await userEvent.click(day(/^20 Oct, 4 seats left/));
    expect(changes()).toEqual({ add: null, cancel: null, reopen: null, specialPrices: null });
    expect(screen.getByRole("link", { name: calendarWords.viewDeparture })).toBeTruthy();
    await userEvent.click(day(/^24 Oct, cancelled/));
    expect(changes()).toEqual({ add: null, cancel: null, reopen: null, specialPrices: null });
  });

  it("offers each change only to whoever may make it", async () => {
    show(
      [
        departure("2027-10-20"),
        departure("2027-10-24", {
          id: "0190a000-0000-7000-8000-0000000000d2",
          status: "cancelled",
          state: "cancelled",
        }),
      ],
      vi.fn(),
      member({ permissions: ["departures:view", "departures:create"] }),
    );
    await userEvent.click(day(/^22 Oct/));
    expect(changes().add).not.toBeNull();
    expect(changes().specialPrices).toBeNull();
    await userEvent.click(day(/^20 Oct, 4 seats left/));
    expect(changes().cancel).toBeNull();
    await userEvent.click(day(/^24 Oct, cancelled/));
    expect(changes().reopen).toBeNull();
  });
});
