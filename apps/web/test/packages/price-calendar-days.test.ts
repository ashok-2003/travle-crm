// The price calendar's pure parts: which season a day falls in, and what each day of the calendar holds.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import type { PackageSeasonView } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { calendarDaysOf, seasonOn } from "@/packages/price-calendar-days";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const season = (id: string, startsOn: string, endsOn: string): PackageSeasonView => ({
  id,
  label: id,
  startsOn,
  endsOn,
  prices: { ...none, double: 100000 },
});
const peak = season("0190a000-0000-7000-8000-0000000000a1", "2027-10-01", "2027-10-31");
const lean = season("0190a000-0000-7000-8000-0000000000a2", "2027-11-01", "2027-11-30");
const departure = (startDate: string): DepartureSummary => ({
  id: "0190a000-0000-7000-8000-0000000000d1",
  title: "Trip",
  destinationName: null,
  startDate,
  endDate: startDate,
  pricePaise: null,
  status: "open",
  state: "open",
  seatsTotal: 10,
  sold: 2,
  held: 0,
  free: 8,
  overbookedBy: 0,
});

describe("seasonOn", () => {
  it("finds the season a day falls in", () => {
    expect(seasonOn([peak, lean], "2027-10-01")).toBe(peak);
    expect(seasonOn([peak, lean], "2027-11-30")).toBe(lean);
  });

  it("a day in no season has none", () => {
    expect(seasonOn([peak, lean], "2027-12-01")).toBeNull();
  });
});

describe("calendarDaysOf", () => {
  it("holds a departure and the index of the season of each departure day", () => {
    const days = calendarDaysOf([peak, lean], [departure("2027-11-05")]);
    expect(days.get("2027-11-05")).toEqual({ departure: departure("2027-11-05"), seasonIndex: 1 });
  });

  it("holds the season of a day with no departure, and nothing of one outside both", () => {
    const days = calendarDaysOf([peak], []);
    expect(days.get("2027-10-10")).toEqual({ departure: null, seasonIndex: 0 });
    expect(days.has("2027-12-10")).toBe(false);
  });
});
