// Calendar dates and time zone names as the API accepts them.
import { describe, expect, it } from "vitest";
import { calendarDate, isCalendarDate, isValidTimeZone, timeZoneName } from "../../src/kernel/index.js";

describe("time zone names", () => {
  it("accept IANA names and UTC", () => {
    for (const zone of ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/Argentina/Buenos_Aires", "UTC"]) {
      expect(isValidTimeZone(zone), zone).toBe(true);
    }
    expect(timeZoneName.parse(" Asia/Kolkata ")).toBe("Asia/Kolkata");
  });

  it("are stored exactly as given, never rewritten", () => {
    for (const zone of ["Etc/UTC", "US/Pacific", "Australia/NSW", "Asia/Kolkata", "America/Port-au-Prince"]) {
      expect(timeZoneName.parse(zone), zone).toBe(zone);
    }
    // Intl ignores case, so another spelling of a zone works too and is kept as typed.
    expect(timeZoneName.parse("Asia/KOLKATA")).toBe("Asia/KOLKATA");
  });

  it("refuse offsets, abbreviations, wrong case and unknown places", () => {
    for (const zone of ["+05:30", "EST", "IST", "asia/kolkata", "Mars/Olympus", "", "Asia/Kolkata/"]) {
      expect(isValidTimeZone(zone), zone).toBe(false);
    }
    expect(timeZoneName.safeParse("IST").success).toBe(false);
  });
});

describe("calendar dates", () => {
  it("accept real days as YYYY-MM-DD and refuse the rest", () => {
    expect(calendarDate.parse("2026-10-15")).toBe("2026-10-15");
    expect(isCalendarDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-10-5", "2026-10-15T10:00", "0999-12-31"]) {
      expect(isCalendarDate(bad), bad).toBe(false);
    }
    expect(calendarDate.safeParse("2026-02-30").success).toBe(false);
  });
});
