// The change assistant's contracts: each kind of change parses, an unknown kind and a wrong field value are refused.
import { describe, expect, it } from "vitest";
import {
  applyPackageChangesInput,
  packageChange,
  proposePackageChangesInput,
  tripFieldValueOf,
} from "../../src/ai/package-changes.js";

const id = "0192f3a0-0000-7000-8000-000000000001";
const common = { id: "c1", evidence: [{ ref: "L1", text: "Double 6,999" }], flags: [] };
const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const prices = { ...none, double: 699900 };
const departure = { departureId: id, startDate: "2027-01-05" };

const samples = [
  { kind: "season_add", label: "Winter", startsOn: "2027-12-18", endsOn: null, prices },
  { kind: "season_change", seasonIds: [id], label: "Winter", before: { label: "Winter", prices: none }, prices },
  { kind: "departures_add", dates: ["2027-01-05", "2027-01-12"] },
  { kind: "departure_cancel", ...departure, reason: "Road closed" },
  { kind: "departure_reopen", ...departure },
  { kind: "departure_prices", ...departure, before: none, prices },
  { kind: "departure_seats", ...departure, before: 10, seatsTotal: 12 },
  { kind: "trip_field", field: "seatsPerDeparture", before: 10, value: 12 },
  { kind: "trip_field", field: "weeklyDays", before: [5], value: [5, 6] },
  { kind: "note_add", line: "Carry warm clothes" },
  { kind: "note_remove", line: "Old line" },
  {
    kind: "itinerary",
    before: [{ title: "Day 1", description: "" }],
    days: [{ title: "Day 1", description: "Arrive" }],
  },
  { kind: "ai_selling", on: true },
];

describe("packageChange", () => {
  it.each(samples)("parses $kind", (sample) => {
    expect(packageChange.safeParse({ ...common, ...sample }).success).toBe(true);
  });

  it("refuses an unknown kind", () => {
    expect(packageChange.safeParse({ ...common, kind: "delete_trip" }).success).toBe(false);
  });

  it("refuses a trip field's value of the wrong type", () => {
    const wrong = { ...common, kind: "trip_field", field: "seatsPerDeparture", before: 10, value: "many" };
    expect(packageChange.safeParse(wrong).success).toBe(false);
  });

  it("holds a trip field to the trip page's own limit", () => {
    const field = { ...common, kind: "trip_field", field: "inclusions", before: "" };
    expect(packageChange.safeParse({ ...field, value: "x".repeat(3000) }).success).toBe(true);
    expect(packageChange.safeParse({ ...field, value: "x".repeat(3001) }).success).toBe(false);
  });

  it("refuses a season label longer than the season input allows, and too many itinerary days", () => {
    expect(packageChange.safeParse({ ...common, ...samples[0], label: "x".repeat(61) }).success).toBe(false);
    const days = Array.from({ length: 61 }, () => ({ title: "Day", description: "" }));
    expect(packageChange.safeParse({ ...common, kind: "itinerary", before: [], days }).success).toBe(false);
  });

  it("narrows a trip field's values by its field", () => {
    const typed = tripFieldValueOf({ field: "weeklyDays", before: [5], value: [5, 6] });
    if (typed.field === "weeklyDays") expect(typed.value.length).toBe(2);
    else throw new Error("wrong field");
  });

  it("refuses an unknown flag", () => {
    expect(packageChange.safeParse({ ...common, kind: "ai_selling", on: true, flags: ["odd"] }).success).toBe(false);
  });
});

describe("inputs", () => {
  it("refuses applying an empty list", () => {
    expect(applyPackageChangesInput.safeParse({ runId: id, changeIds: [] }).success).toBe(false);
  });

  it("defaults the answers and refuses unknown keys", () => {
    const input = { packageId: id, text: "New rates", attachmentIds: [] };
    expect(proposePackageChangesInput.parse(input).answers).toEqual([]);
    expect(proposePackageChangesInput.safeParse({ ...input, extra: 1 }).success).toBe(false);
  });
});
