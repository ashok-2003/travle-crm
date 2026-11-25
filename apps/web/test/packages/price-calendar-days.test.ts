// The price calendar's pure parts: the departure each day holds.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import { describe, expect, it } from "vitest";
import { departuresByDay } from "@/packages/price-calendar-days";

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

describe("departuresByDay", () => {
  it("holds the departure that starts on a day, and nothing for another", () => {
    const days = departuresByDay([departure("2027-11-05")]);
    expect(days.get("2027-11-05")).toEqual(departure("2027-11-05"));
    expect(days.has("2027-11-06")).toBe(false);
  });
});
