// How long ago something happened ("12 min"), and which day an instant falls on as the agency's clocks see it:
// yesterday, today or tomorrow there, whatever zone the device is in (Review Focus 3).
import { afterEach, describe, expect, it } from "vitest";
import { dayRelation, elapsed } from "@/lib/relative-time";

const at = (iso: string) => new Date(iso);
const originalZone = process.env.TZ;

afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

describe("elapsed", () => {
  it("counts minutes under an hour, hours under a day, then days", () => {
    const now = at("2026-10-16T10:00:00Z");
    expect(elapsed(at("2026-10-16T09:48:00Z"), now)).toEqual({ unit: "minute", count: 12 });
    expect(elapsed(at("2026-10-16T09:59:40Z"), now)).toEqual({ unit: "minute", count: 1 });
    expect(elapsed(at("2026-10-16T09:00:00Z"), now)).toEqual({ unit: "hour", count: 1 });
    expect(elapsed(at("2026-10-15T20:00:00Z"), now)).toEqual({ unit: "hour", count: 14 });
    expect(elapsed(at("2026-10-13T09:00:00Z"), now)).toEqual({ unit: "day", count: 3 });
  });
});

describe("dayRelation", () => {
  it("says today and tomorrow by the agency's clocks, whatever the device's zone", () => {
    process.env.TZ = "America/New_York";
    // 00:05 on 17 October in India; still the afternoon of the 16th in New York.
    const now = at("2026-10-16T18:35:00Z");
    const india = { timeZone: "Asia/Kolkata", now };
    expect(dayRelation(at("2026-10-17T05:00:00Z"), india)).toBe("today");
    expect(dayRelation(at("2026-10-16T17:00:00Z"), india)).toBe("yesterday");
    expect(dayRelation(at("2026-10-17T19:00:00Z"), india)).toBe("tomorrow");
    expect(dayRelation(at("2026-10-15T10:00:00Z"), india)).toBe("earlier");
    expect(dayRelation(at("2026-10-19T10:00:00Z"), india)).toBe("later");
    // At 23:50 in India, 00:10 is tomorrow.
    expect(dayRelation(at("2026-10-16T18:40:00Z"), { timeZone: "Asia/Kolkata", now: at("2026-10-16T18:20:00Z") })).toBe(
      "tomorrow",
    );
  });
});
