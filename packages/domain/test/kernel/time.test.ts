// Times are instants in UTC, shown and counted in the organization's time zone (spec 9.6); departure dates are
// calendar dates with no time at all.
import { describe, expect, it } from "vitest";
import { calendarDateIn, formatDateTime, parseCalendarDate, startOfDayIn, yearIn } from "../../src/kernel/index.js";

const at = (iso: string) => new Date(iso);

describe("calendar dates in a time zone", () => {
  it("turns over at midnight India time, 18:30 UTC", () => {
    expect(calendarDateIn(at("2026-10-14T18:29:59Z"), "Asia/Kolkata")).toBe("2026-10-14");
    expect(calendarDateIn(at("2026-10-14T18:30:00Z"), "Asia/Kolkata")).toBe("2026-10-15");
    expect(calendarDateIn(at("2026-10-14T20:00:00Z"), "Asia/Dubai")).toBe("2026-10-15");
    expect(calendarDateIn(at("2026-10-14T20:00:00Z"), "UTC")).toBe("2026-10-14");
  });

  it("counts the year in the zone, so New Year comes five and a half hours early in India", () => {
    expect(yearIn(at("2026-12-31T18:30:00Z"), "Asia/Kolkata")).toBe(2027);
    expect(yearIn(at("2026-12-31T18:30:00Z"), "UTC")).toBe(2026);
  });

  it("finds the instant a day starts, through daylight saving changes", () => {
    expect(startOfDayIn(parseCalendarDate("2026-10-15"), "Asia/Kolkata")).toEqual(at("2026-10-14T18:30:00Z"));
    expect(startOfDayIn(parseCalendarDate("2026-07-01"), "Europe/London")).toEqual(at("2026-06-30T23:00:00Z"));
    // British Summer Time starts at 01:00 on 29 March 2026; that day still starts at midnight GMT.
    expect(startOfDayIn(parseCalendarDate("2026-03-29"), "Europe/London")).toEqual(at("2026-03-29T00:00:00Z"));
    // Cuba skips midnight on 8 March 2026 (00:00 becomes 01:00): the day starts at 01:00 local.
    expect(startOfDayIn(parseCalendarDate("2026-03-08"), "America/Havana")).toEqual(at("2026-03-08T05:00:00Z"));
  });

  it("refuses a time zone that isn't an IANA name", () => {
    expect(() => calendarDateIn(at("2026-10-15T00:00:00Z"), "+05:30")).toThrow(RangeError);
    expect(() => yearIn(at("2026-10-15T00:00:00Z"), "Mars/Olympus")).toThrow(RangeError);
    expect(() => startOfDayIn(parseCalendarDate("2026-10-15"), "IST")).toThrow(RangeError);
  });
});

describe("calendar dates", () => {
  it("are real days written YYYY-MM-DD", () => {
    expect(parseCalendarDate("2028-02-29")).toBe("2028-02-29");
    for (const bad of ["2026-02-30", "2026-2-3", "15/10/2026", "2026-10-15T00:00:00Z", "0999-01-01"]) {
      expect(() => parseCalendarDate(bad), bad).toThrow(RangeError);
    }
  });
});

describe("formatDateTime", () => {
  const evening = at("2026-10-15T16:00:00Z");

  it("shows dates and times the Indian way, in the zone", () => {
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "date" })).toBe("15 Oct 2026");
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "time" })).toBe("9:30 pm");
    expect(formatDateTime(evening, { timeZone: "Asia/Kolkata", style: "date-time" })).toBe("15 Oct 2026, 9:30 pm");
    expect(formatDateTime(evening, { timeZone: "Europe/London", style: "date-time" })).toBe("15 Oct 2026, 5:00 pm");
  });

  it("keeps en-IN's own month names and midnight", () => {
    expect(formatDateTime(at("2026-09-15T06:00:00Z"), { timeZone: "Asia/Kolkata", style: "date" })).toBe(
      "15 Sept 2026",
    );
    expect(formatDateTime(at("2026-10-14T18:30:00Z"), { timeZone: "Asia/Kolkata", style: "time" })).toBe("12:00 am");
  });

  it("refuses a zone that isn't an IANA name", () => {
    expect(() => formatDateTime(evening, { timeZone: "EST", style: "date" })).toThrow(RangeError);
  });
});
