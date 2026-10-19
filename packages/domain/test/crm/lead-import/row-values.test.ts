// The readers of a lead file's cells (bulk plan, Task 1.2; Review Focus 1): days always day first, months, rupees,
// adults and children's ages.
import { describe, expect, it } from "vitest";
import {
  readAdults,
  readChildrenAges,
  readDay,
  readDayAndTime,
  readMonth,
  readPaise,
} from "../../../src/crm/lead-import/row-values.js";

describe("reading a day", () => {
  it.each([
    ["2026-10-16", "2026-10-16"],
    ["16/10/2026", "2026-10-16"],
    ["16-10-2026", "2026-10-16"],
    ["16.10.2026", "2026-10-16"],
    ["16 Oct 2026", "2026-10-16"],
    ["16-Oct-2026", "2026-10-16"],
    ["16th October 2026", "2026-10-16"],
    ["Oct 16, 2026", "2026-10-16"],
    ["1/2/2027", "2027-02-01"],
  ])("reads %s as %s", (text, day) => {
    expect(readDay(text)).toBe(day);
  });

  it("reads 10/12/2026 as 10 December, never 12 October", () => {
    expect(readDay("10/12/2026")).toBe("2026-12-10");
  });

  it.each(["45941", "next winter", "31/02/2026", "10/12/26", "2026-13-01", ""])("cannot read %s", (text) => {
    expect(readDay(text)).toBeNull();
  });

  it("trusts a d/m/y in a month-first sheet only when it can't be month first", () => {
    expect(readDay("10/12/2026", { monthFirstDates: true })).toBeNull();
    expect(readDay("10/25/2026", { monthFirstDates: true })).toBe("2026-10-25");
    expect(readDay("25/10/2026", { monthFirstDates: true })).toBe("2026-10-25");
    expect(readDay("2026-12-10", { monthFirstDates: true })).toBe("2026-12-10");
  });

  it("reads a time after the day", () => {
    expect(readDayAndTime("19/10/2026 14:32:10")).toEqual({
      day: "2026-10-19",
      time: { hour: 14, minute: 32, second: 10 },
    });
    expect(readDayAndTime("2026-10-19T09:02")).toEqual({ day: "2026-10-19", time: { hour: 9, minute: 2, second: 0 } });
    expect(readDayAndTime("19/10/2026 5:30 PM")?.time).toEqual({ hour: 17, minute: 30, second: 0 });
    expect(readDayAndTime("19/10/2026 12:05 AM")?.time).toEqual({ hour: 0, minute: 5, second: 0 });
    expect(readDayAndTime("19/10/2026")).toEqual({ day: "2026-10-19", time: null });
    expect(readDayAndTime("19/10/2026 25:00")).toBeNull();
  });
});

describe("reading a month", () => {
  it.each(["Dec 2026", "December 2026", "12/2026", "2026-12", "dec-2026"])("reads %s as 2026-12", (text) => {
    expect(readMonth(text)).toBe("2026-12");
  });

  it("reads Sept as September", () => {
    expect(readMonth("Sept 2026")).toBe("2026-09");
  });

  it.each(["flexible", "Open", "not fixed", "Not decided yet"])("reads %s as flexible", (text) => {
    expect(readMonth(text)).toBe("flexible");
  });

  it.each(["December", "13/2026", "soon", "2026"])("cannot read %s", (text) => {
    expect(readMonth(text)).toBeNull();
  });
});

describe("reading rupees", () => {
  it.each([
    ["₹1,50,000", 15_000_000],
    ["Rs 150000", 15_000_000],
    ["Rs. 1,50,000/-", 15_000_000],
    ["INR 1.5 lakh", 15_000_000],
    ["150k", 15_000_000],
    ["1.5 L", 15_000_000],
    ["2 lac", 20_000_000],
    ["1 Cr", 1_000_000_000],
    ["1 crore", 1_000_000_000],
    ["2500.50", 250_050],
    ["50000", 5_000_000],
  ])("reads %s in rupees", (text, paise) => {
    expect(readPaise(text)).toBe(paise);
  });

  it.each(["", "lots", "0", "1.234", "-500", "1e5", "101 crore", "5 dollars"])("cannot read %s", (text) => {
    expect(readPaise(text)).toBeNull();
  });
});

describe("reading adults and children's ages", () => {
  it("reads adults 1 to 99", () => {
    expect([readAdults("2"), readAdults("2 adults"), readAdults("0"), readAdults("100"), readAdults("two")]).toEqual([
      2,
      2,
      null,
      null,
      null,
    ]);
  });

  it("reads a list of ages 0 to 17", () => {
    expect(readChildrenAges("7, 4")).toEqual([7, 4]);
    expect(readChildrenAges("7 and 4")).toEqual([7, 4]);
    expect(readChildrenAges("7;4")).toEqual([7, 4]);
    expect(readChildrenAges("9")).toEqual([9]);
    expect(readChildrenAges("seven")).toBeNull();
    expect(readChildrenAges("18")).toBeNull();
    expect(readChildrenAges("")).toBeNull();
  });
});
