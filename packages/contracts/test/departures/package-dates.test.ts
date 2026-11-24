// Adding a trip's dates in bulk: the range's limits.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addPackageDatesInput, MAX_ADDED_DATES } from "../../src/departures/index.js";

const packageId = randomUUID();

describe("addPackageDatesInput", () => {
  it("takes a range of exactly the most days", () => {
    expect(MAX_ADDED_DATES).toBe(62);
    expect(
      addPackageDatesInput.safeParse({ packageId, from: "2026-12-01", to: "2027-01-31", weekdays: [] }).success,
    ).toBe(true);
  });

  it("refuses more than 62 days", () => {
    expect(
      addPackageDatesInput.safeParse({ packageId, from: "2026-12-01", to: "2027-02-01", weekdays: [] }).success,
    ).toBe(false);
  });

  it("refuses an end before the start", () => {
    expect(
      addPackageDatesInput.safeParse({ packageId, from: "2026-12-05", to: "2026-12-04", weekdays: [] }).success,
    ).toBe(false);
  });

  it("refuses a weekday outside 0 to 6 and an unknown key", () => {
    const base = { packageId, from: "2026-12-01", to: "2026-12-10", weekdays: [] };
    expect(addPackageDatesInput.safeParse({ ...base, weekdays: [7] }).success).toBe(false);
    expect(addPackageDatesInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
