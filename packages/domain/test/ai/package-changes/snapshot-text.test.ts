// How an open season column reads to the model: "all other days" only when it covers every day before it.
import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { buildSnapshot, type SnapshotInput } from "../../../src/ai/package-changes/trip-snapshot.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const season = (id: string, label: string, startsOn: string, endsOn: string, double: number) => ({
  id,
  label,
  startsOn,
  endsOn,
  prices: { ...none, double },
});
const input = (seasons: SnapshotInput["seasons"]): SnapshotInput => ({
  from: parseCalendarDate("2026-11-25"),
  trip: {
    id: "t",
    name: "Hill town",
    kind: "group",
    nights: 4,
    roomTypes: ["double"],
    seatsPerDeparture: 40,
    advancePerPersonPaise: null,
    weeklyDays: [],
    departureMonths: [],
    pickupPoints: "",
    startCity: "",
    inclusions: "",
    exclusions: "",
    cancellationNotes: "",
    notes: "",
    days: [],
    aiSellable: false,
  },
  seasons,
  departures: [],
});

describe("an open season column in the trip text", () => {
  it("covering every day before it reads 'all other days'", () => {
    const { text } = buildSnapshot(
      input([
        season("a", "Regular", "2026-01-01", "2026-12-17", 600_000),
        season("b", "Christmas", "2026-12-18", "2027-01-01", 900_000),
        season("c", "Regular", "2027-01-02", "2099-12-31", 600_000),
      ]),
    );
    expect(text).toContain("Regular, all other days: double ₹6,000");
  });

  it("starting after another season reads 'from <day> onwards'", () => {
    const { text } = buildSnapshot(
      input([
        season("b", "Christmas", "2026-12-18", "2027-01-01", 900_000),
        season("c", "Regular", "2027-01-02", "2099-12-31", 600_000),
      ]),
    );
    expect(text).toContain("Regular, from Sat 2 Jan 2027 onwards: double ₹6,000");
    expect(text).not.toContain("2099");
  });
});
