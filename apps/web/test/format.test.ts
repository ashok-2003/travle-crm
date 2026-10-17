// Indian formats (DESIGN.md section 9): lakh and crore grouping, paise only when there are some, dates in the
// organization's zone, where 18:30 UTC is already the next day, and phone numbers as Indians write them.
import { money } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDay,
  formatDayTime,
  formatPhoneNumber,
  formatRupees,
  formatTime,
  formatWeekday,
} from "@/lib/format";

describe("formatRupees", () => {
  it("groups by lakh and crore, and shows paise only when there are some", () => {
    expect(formatRupees(money(125_000_000))).toBe("₹12,50,000");
    expect(formatRupees(money(125_050))).toBe("₹1,250.50");
    expect(formatRupees(money(-450_000))).toBe("-₹4,500");
    expect(formatRupees(money(0))).toBe("₹0");
  });

  it("always shows paise when asked, as invoices do", () => {
    expect(formatRupees(money(125_000_000), { paise: "always" })).toBe("₹12,50,000.00");
  });
});

describe("formatCount", () => {
  it("groups the Indian way", () => {
    expect(formatCount(123_456)).toBe("1,23,456");
    expect(formatCount(999)).toBe("999");
  });
});

describe("formatDay", () => {
  const now = new Date("2026-10-15T06:00:00Z");

  it("leaves the year out for this year and shows it for others", () => {
    expect(formatDay(new Date("2026-10-16T06:00:00Z"), { timeZone: "Asia/Kolkata", now })).toBe("16 Oct");
    expect(formatDay(new Date("2027-10-16T06:00:00Z"), { timeZone: "Asia/Kolkata", now })).toBe("16 Oct 2027");
  });

  it("counts the day in the organization's zone, not in UTC", () => {
    // 18:45 UTC on 15 October is 00:15 on 16 October in India.
    const lateEvening = new Date("2026-10-15T18:45:00Z");
    expect(formatDay(lateEvening, { timeZone: "Asia/Kolkata", now })).toBe("16 Oct");
    expect(formatDay(lateEvening, { timeZone: "UTC", now })).toBe("15 Oct");
  });

  it("decides 'this year' in the organization's zone too", () => {
    // 31 Dec 2026 20:00 UTC is already 1 Jan 2027 in India.
    const newYearInIndia = new Date("2026-12-31T20:00:00Z");
    expect(formatDay(newYearInIndia, { timeZone: "Asia/Kolkata", now: new Date("2027-01-02T00:00:00Z") })).toBe(
      "1 Jan",
    );
  });
});

describe("formatWeekday", () => {
  it("names the day of the week in short, as the organization's clocks show it", () => {
    expect(formatWeekday(new Date("2026-10-16T06:00:00Z"), { timeZone: "Asia/Kolkata" })).toBe("Fri");
    // 10:30 pm on Thursday in UTC is already Friday in India.
    const lateEvening = new Date("2026-10-15T22:30:00Z");
    expect(formatWeekday(lateEvening, { timeZone: "Asia/Kolkata" })).toBe("Fri");
    expect(formatWeekday(lateEvening, { timeZone: "UTC" })).toBe("Thu");
  });
});

describe("formatTime", () => {
  it("uses the 12-hour clock in the organization's zone", () => {
    expect(formatTime(new Date("2026-10-15T11:00:00Z"), { timeZone: "Asia/Kolkata" })).toBe("4:30 pm");
  });
});

describe("formatDayTime", () => {
  it("is the day, then the time, both in the organization's zone", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    expect(formatDayTime(new Date("2026-10-15T18:45:00Z"), { timeZone: "Asia/Kolkata", now })).toBe("16 Oct, 12:15 am");
    expect(formatDayTime(new Date("2027-03-01T04:00:00Z"), { timeZone: "Asia/Kolkata", now })).toBe(
      "1 Mar 2027, 9:30 am",
    );
  });
});

describe("formatPhoneNumber", () => {
  it("writes an Indian number as +91 and two groups of five, and any other as it is stored", () => {
    expect(formatPhoneNumber("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhoneNumber("+14155550123")).toBe("+14155550123");
  });
});
