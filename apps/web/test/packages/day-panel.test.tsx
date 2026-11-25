// The day panel: what a tapped day holds and the changes it offers, by what the day is (a departure ahead, a cancelled
// one, an empty day ahead, a day that has passed).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayPanel } from "@/packages/day-panel";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { answerNext, calendarDeparture, detail } from "./departures-support";

const TODAY = "2026-11-25";
const departure = calendarDeparture("2026-11-27");
const noPrices = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

function show(
  day: string,
  entry: ReturnType<typeof calendarDeparture> | null = departure,
  me = member({ isOwner: true }),
) {
  screenIs("wide");
  const api = fakeApi();
  renderWithApi(
    <DayPanel detail={detail} day={day} departure={entry} today={TODAY} onDayChange={vi.fn()} />,
    newQueryClient(),
    me,
  );
  return api;
}
const button = (name: string) => screen.getByRole("button", { name });

describe("DayPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a departure ahead shows its season, each room's price and its seats, and a way in", () => {
    show("2026-11-27");
    expect(screen.getByText("Season: Regular")).toBeTruthy();
    expect(screen.getByText("Double ₹5,999")).toBeTruthy();
    expect(screen.getByText("Single ₹7,999")).toBeTruthy();
    expect(screen.getByText("8 booked, 0 on hold, 32 left of 40")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open departure" }).getAttribute("href")).toBe(
      "/departures/0190a000-0000-7000-8000-0000000000d1",
    );
    expect(button("Cancel departure")).toBeTruthy();
  });

  it("Change seats sends setSeats", async () => {
    const api = show("2026-11-27");
    await userEvent.click(button("Change seats"));
    const box = screen.getByLabelText("Seats on this departure");
    await userEvent.clear(box);
    await userEvent.type(box, "45");
    await userEvent.click(button("Save seats"));
    expect(await answerNext(api, "departures.setSeats", {})).toEqual({
      departureId: departure.departureId,
      seatsTotal: 45,
    });
  });

  it("Price for this departure only shows the season's price in each box; an empty box keeps the season's price", async () => {
    const api = show("2026-11-27");
    await userEvent.click(button("Price for this departure only"));
    const double = screen.getByLabelText("Double, per person");
    expect(double.getAttribute("placeholder")).toBe("5,999");
    await userEvent.type(double, "6500");
    await userEvent.click(button("Save prices"));
    expect(await answerNext(api, "departures.setPrices", {})).toEqual({
      departureId: departure.departureId,
      prices: { ...noPrices, double: 650000, single: 799900 },
    });
  });

  it("offers the season's prices only on a departure with its own prices", () => {
    show("2026-11-27");
    expect(screen.queryByRole("button", { name: "Use the season's prices" })).toBeNull();
  });

  it("Use the season's prices sends all null", async () => {
    const own = calendarDeparture("2026-11-27", {
      priceSource: "departure",
      ownPrices: { ...noPrices, single: 700000, double: 650000 },
    });
    const api = show("2026-11-27", own);
    await userEvent.click(button("Use the season's prices"));
    expect(await answerNext(api, "departures.setPrices", {})).toEqual({
      departureId: departure.departureId,
      prices: noPrices,
    });
  });

  it("a cancelled departure offers Reopen, which sends reopen", async () => {
    const api = show("2026-11-27", calendarDeparture("2026-11-27", { status: "cancelled" }));
    await userEvent.click(button("Reopen this departure"));
    expect(await answerNext(api, "departures.reopen", {})).toEqual({ departureId: departure.departureId });
  });

  it("an empty day ahead adds one departure on that day", async () => {
    const api = show("2026-12-04", null);
    await userEvent.click(button("Add a departure on Fri 4 Dec"));
    const answer = { added: ["2026-12-04"], alreadyThere: [], cancelled: [] };
    expect(await answerNext(api, "departures.addPackageDates", answer)).toEqual({
      packageId: detail.id,
      from: "2026-12-04",
      to: "2026-12-04",
      weekdays: [],
    });
  });

  it("Repeat every week until a date adds that weekday from the day to the date", async () => {
    const api = show("2026-12-04", null);
    await userEvent.click(screen.getByRole("switch", { name: "Repeat every Friday" }));
    await userEvent.type(screen.getByLabelText("Repeat every week until"), "31/01/2027");
    await userEvent.click(button("Add a departure on Fri 4 Dec"));
    const empty = { added: [], alreadyThere: [], cancelled: [] };
    expect(await answerNext(api, "departures.addPackageDates", empty)).toEqual({
      packageId: detail.id,
      from: "2026-12-04",
      to: "2027-01-31",
      weekdays: [5],
    });
  });

  it("a repeat longer than 62 days goes in several calls", async () => {
    const api = show("2026-12-04", null);
    await userEvent.click(screen.getByRole("switch", { name: "Repeat every Friday" }));
    await userEvent.type(screen.getByLabelText("Repeat every week until"), "31/03/2027");
    await userEvent.click(button("Add a departure on Fri 4 Dec"));
    const empty = { added: [], alreadyThere: [], cancelled: [] };
    expect(await answerNext(api, "departures.addPackageDates", empty)).toEqual({
      packageId: detail.id,
      from: "2026-12-04",
      to: "2027-02-03",
      weekdays: [5],
    });
    expect(await answerNext(api, "departures.addPackageDates", empty)).toEqual({
      packageId: detail.id,
      from: "2027-02-04",
      to: "2027-03-31",
      weekdays: [5],
    });
  });

  it("Repeat every week with no end adds the weekday to the trip's weekly days", async () => {
    const api = show("2026-12-05", null);
    await userEvent.click(screen.getByRole("switch", { name: "Repeat every Saturday" }));
    await userEvent.click(screen.getByRole("radio", { name: "With no end" }));
    await userEvent.click(button("Add a departure on Sat 5 Dec"));
    await answerNext(api, "departures.addPackageDates", { added: ["2026-12-05"], alreadyThere: [], cancelled: [] });
    expect(await answerNext(api, "packages.updatePart", {})).toEqual({ packageId: detail.id, weeklyDays: [5, 6] });
  });

  it("a day that has passed can be read and nothing more", () => {
    show("2026-11-20", calendarDeparture("2026-11-20"));
    expect(screen.getByText("This day has passed, so nothing here can change.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancel departure|Change seats|Add a departure/ })).toBeNull();
  });

  it("today counts as passed: the api refuses changes to it", () => {
    show(TODAY, null);
    expect(screen.queryByRole("button", { name: /Add a departure/ })).toBeNull();
  });

  it("without the permission to change departures offers no change", () => {
    show("2026-11-27", departure, member({ isOwner: false, permissions: ["departures:view"] }));
    expect(screen.queryByRole("button", { name: /Change seats|Cancel departure/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Open departure" })).toBeTruthy();
  });
});
