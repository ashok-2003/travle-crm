// The slow-reply clock counts working minutes in the agency's zone (release 4, spec 4.5): days and an opening and
// closing time, so a lead that comes in at night is due after the next opening.
import { describe, expect, it } from "vitest";
import { addWorkingMinutes, type WorkingHours } from "../../src/kernel/index.js";

const MONDAY_TO_SATURDAY = 0b0111111;
const hours: WorkingHours = { workdays: MONDAY_TO_SATURDAY, opensMinute: 10 * 60, closesMinute: 19 * 60 };
// 2026-10-19 is a Monday; India is 5 hours 30 minutes ahead of UTC.
const india = (local: string) => new Date(`${local}+05:30`);
const due = (start: string, minutes: number, schedule = hours) =>
  addWorkingMinutes(india(start), minutes, schedule, "Asia/Kolkata").toISOString();
const expectLocal = (iso: string, local: string) => {
  expect(iso).toBe(india(local).toISOString());
};

describe("addWorkingMinutes", () => {
  it("adds straight on inside the hours", () => {
    expectLocal(due("2026-10-19T11:00:00", 15), "2026-10-19T11:15:00");
  });

  it("returns the start when no time is asked", () => {
    expectLocal(due("2026-10-19T11:00:00", 0), "2026-10-19T11:00:00");
  });

  it("carries a wait over the closing time to the next morning", () => {
    expectLocal(due("2026-10-19T18:50:00", 15), "2026-10-20T10:05:00");
  });

  it("starts the clock at opening for a lead that came in at night or before opening", () => {
    expectLocal(due("2026-10-19T02:00:00", 15), "2026-10-19T10:15:00");
    expectLocal(due("2026-10-19T21:00:00", 15), "2026-10-20T10:15:00");
  });

  it("is due at closing when the wait ends exactly then", () => {
    expectLocal(due("2026-10-19T18:45:00", 15), "2026-10-19T19:00:00");
  });

  it("skips a day the agency is closed", () => {
    // Saturday 18:55 + 15: Sunday is closed, so the rest is due on Monday.
    expectLocal(due("2026-10-24T18:55:00", 15), "2026-10-26T10:10:00");
    expectLocal(due("2026-10-25T12:00:00", 15), "2026-10-26T10:15:00");
  });

  it("spans several days for a long wait", () => {
    // 540 working minutes a day: a 1,080-minute wait from Friday 10:00 ends Saturday 19:00.
    expectLocal(due("2026-10-23T10:00:00", 1080), "2026-10-24T19:00:00");
    expectLocal(due("2026-10-24T10:00:00", 1081), "2026-10-27T10:01:00");
  });

  it("counts wall minutes when every day is off", () => {
    expectLocal(due("2026-10-25T12:00:00", 90, { ...hours, workdays: 0 }), "2026-10-25T13:30:00");
  });

  it("reads a closing time at the end of the day", () => {
    const allDay: WorkingHours = { workdays: 127, opensMinute: 0, closesMinute: 1440 };
    expectLocal(due("2026-10-19T23:50:00", 20, allDay), "2026-10-20T00:10:00");
  });

  it("counts the days in the zone it is given, not UTC", () => {
    // 2026-10-19T20:00Z is already Tuesday 01:30 in India; in UTC it is Monday evening.
    const mondayOnly: WorkingHours = { workdays: 1, opensMinute: 600, closesMinute: 1140 };
    const result = addWorkingMinutes(new Date("2026-10-19T20:00:00Z"), 15, mondayOnly, "Asia/Kolkata");
    expectLocal(result.toISOString(), "2026-10-26T10:15:00");
  });

  it("follows a zone's clock change", () => {
    // New York leaves daylight saving on 2026-11-01; Monday 2 November 10:00 is UTC-5, not UTC-4.
    const result = addWorkingMinutes(new Date("2026-11-01T12:00:00Z"), 10, hours, "America/New_York");
    expect(result.toISOString()).toBe("2026-11-02T15:10:00.000Z");
  });

  it("refuses a zone that is not a name", () => {
    expect(() => addWorkingMinutes(new Date(), 5, hours, "+05:30")).toThrow(RangeError);
  });
});
