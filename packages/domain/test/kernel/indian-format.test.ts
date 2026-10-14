// Numbers and money are shown the Indian way: ₹12,50,000.00, grouped in lakhs and crores.
import { describe, expect, it } from "vitest";
import { formatIndianNumber, formatMoney, money } from "../../src/kernel/index.js";

describe("Indian number format", () => {
  it("groups the last three digits, then pairs", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [999, "999"],
      [1000, "1,000"],
      [12_345, "12,345"],
      [100_000, "1,00,000"],
      [1_250_000, "12,50,000"],
      [12_345_678, "1,23,45,678"],
      [1_234_567_890, "1,23,45,67,890"],
      [-50_000, "-50,000"],
    ];
    for (const [value, shown] of cases) expect(formatIndianNumber(value)).toBe(shown);
    expect(formatIndianNumber(12_345_678_901_234_567_890n)).toBe("1,23,45,67,89,01,23,45,67,890");
    expect(formatIndianNumber(1234.5, { fractionDigits: 2 })).toBe("1,234.50");
  });

  it("formats money in rupees and paise, with or without the symbol", () => {
    expect(formatMoney(money(125_000_000))).toBe("₹12,50,000.00");
    expect(formatMoney(money(5))).toBe("₹0.05");
    expect(formatMoney(money(-50_000))).toBe("-₹500.00");
    expect(formatMoney(money(123_456_789_012), { symbol: false })).toBe("1,23,45,67,890.12");
  });

  it("matches what browsers show for en-IN, so the web app and PDFs agree", () => {
    const intl = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
    for (const paise of [0, 1, 99, 100_050, 125_000_000, 9_876_543_210, -1_999_999, 900_719_925_474_099]) {
      expect(formatMoney(money(paise)), String(paise)).toBe(intl.format(paise / 100));
    }
  });

  it("refuses numbers that can't be shown exactly", () => {
    expect(() => formatIndianNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatIndianNumber(1.5)).toThrow(RangeError);
  });
});
