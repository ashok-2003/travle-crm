// The calendar read spans at most 45 days.
import { describe, expect, it } from "vitest";
import { departureCalendarInput } from "../../src/departures/index.js";

const packageId = "0190a000-0000-7000-8000-0000000000a1";
describe("departureCalendarInput", () => {
  it("takes 45 days and refuses 46", () => {
    expect(departureCalendarInput.safeParse({ packageId, from: "2026-12-01", to: "2027-01-15" }).success).toBe(true);
    expect(departureCalendarInput.safeParse({ packageId, from: "2026-12-01", to: "2027-01-16" }).success).toBe(false);
  });
});
