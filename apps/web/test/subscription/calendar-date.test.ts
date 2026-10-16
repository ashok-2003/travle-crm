// @vitest-environment node
// A subscription's days as the organization's calendar shows them (DESIGN.md section 9): "22 Oct" this year,
// "5 Jan 2027" in another, the year counted by the organization's clocks, and never the day before in any zone.
import { describe, expect, it } from "vitest";
import { formatCalendarDate } from "@/subscription/calendar-date";

describe("formatCalendarDate", () => {
  const now = new Date("2026-10-16T06:00:00Z");

  it("shows a day of this year without the year, and another year's with it", () => {
    expect(formatCalendarDate("2026-10-22", { timeZone: "Asia/Kolkata", now })).toBe("22 Oct");
    expect(formatCalendarDate("2027-01-05", { timeZone: "Asia/Kolkata", now })).toBe("5 Jan 2027");
  });

  it("counts this year by the organization's clocks", () => {
    // 20:00 UTC on 31 December is already New Year's Day in India, but not yet in New York.
    const newYearsEve = new Date("2026-12-31T20:00:00Z");
    expect(formatCalendarDate("2027-01-05", { timeZone: "Asia/Kolkata", now: newYearsEve })).toBe("5 Jan");
    expect(formatCalendarDate("2027-01-05", { timeZone: "America/New_York", now: newYearsEve })).toBe("5 Jan 2027");
  });

  it("shows the day itself, whichever side of UTC the zone is", () => {
    expect(formatCalendarDate("2026-10-22", { timeZone: "America/Los_Angeles", now })).toBe("22 Oct");
    expect(formatCalendarDate("2026-10-22", { timeZone: "Pacific/Kiritimati", now })).toBe("22 Oct");
  });
});
