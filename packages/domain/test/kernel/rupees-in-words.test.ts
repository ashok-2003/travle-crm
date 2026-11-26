// An amount in words, the Indian way, for the invoice's "Amount in words" line.
import { describe, expect, it } from "vitest";
import { rupeesInWords } from "../../src/kernel/index.js";

describe("rupeesInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [100, "Rupees One Only"],
    [9900, "Rupees Ninety Nine Only"],
    [10_000, "Rupees One Hundred Only"],
    [100_000, "Rupees One Thousand Only"],
    [10_000_000, "Rupees One Lakh Only"],
    [125_000_000, "Rupees Twelve Lakh Fifty Thousand Only"],
    [1_000_000_000, "Rupees One Crore Only"],
    [1050, "Rupees Ten and Fifty Paise Only"],
    [50, "Fifty Paise Only"],
    [12_034_500_101, "Rupees Twelve Crore Three Lakh Forty Five Thousand One and One Paise Only"],
  ])("writes %i paise as %s", (paise, words) => {
    expect(rupeesInWords(paise)).toBe(words);
  });

  it("writes one lakh twenty thousand rupees and fifty paise", () => {
    expect(rupeesInWords(12_000_050)).toBe("Rupees One Lakh Twenty Thousand and Fifty Paise Only");
  });

  it("refuses a negative or fractional amount", () => {
    expect(() => rupeesInWords(-1)).toThrow(RangeError);
    expect(() => rupeesInWords(1.5)).toThrow(RangeError);
  });
});
