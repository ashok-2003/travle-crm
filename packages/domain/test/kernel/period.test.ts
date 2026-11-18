// A period's start is the agency's midnight, the Monday of the week, or the 1st of the month (web revamp, Home).
import { describe, expect, it } from "vitest";
import { periodStart } from "../../src/kernel/index.js";

const kolkata = "Asia/Kolkata";

describe("periodStart", () => {
  it("starts the week at Monday 00:00 in the agency's zone", () => {
    expect(periodStart("week", new Date("2026-11-15T18:35:00Z"), kolkata)).toEqual(new Date("2026-11-15T18:30:00Z"));
  });

  it("keeps the previous Monday while it is still Sunday in the agency's zone", () => {
    // Sun 2026-11-15 23:30 IST
    expect(periodStart("week", new Date("2026-11-15T18:00:00Z"), kolkata)).toEqual(new Date("2026-11-08T18:30:00Z"));
  });

  it("starts the month on the 1st", () => {
    expect(periodStart("month", new Date("2026-11-18T06:00:00Z"), kolkata)).toEqual(new Date("2026-10-31T18:30:00Z"));
  });

  it("starts today at the day's midnight", () => {
    expect(periodStart("today", new Date("2026-11-18T06:00:00Z"), kolkata)).toEqual(new Date("2026-11-17T18:30:00Z"));
  });

  it("has no start for all time", () => {
    expect(periodStart("all", new Date("2026-11-18T06:00:00Z"), kolkata)).toBeNull();
  });
});
