// Money crosses the API as integer paise with its currency; typed amounts become paise without floats.
import { describe, expect, it } from "vitest";
import { moneyField, paiseFromRupeesText, rupeesText } from "../../src/kernel/index.js";

describe("money contracts", () => {
  it("accepts whole paise in rupees and nothing else", () => {
    expect(moneyField.parse({ amountPaise: 125_000_050, currency: "INR" })).toEqual({
      amountPaise: 125_000_050,
      currency: "INR",
    });
    for (const bad of [
      { amountPaise: 1.5, currency: "INR" },
      { amountPaise: 2 ** 53, currency: "INR" },
      { amountPaise: 100, currency: "USD" },
      { amountPaise: 100, currency: "INR", extra: true },
      { amountPaise: "100", currency: "INR" },
    ]) {
      expect(moneyField.safeParse(bad).success).toBe(false);
    }
  });

  it("reads a typed amount into paise", () => {
    expect(rupeesText.parse(" 12,50,000.50 ")).toBe(125_000_050);
    expect(rupeesText.parse("₹999")).toBe(99_900);
    expect(rupeesText.safeParse("12.345").success).toBe(false);
    expect(paiseFromRupeesText("1.5")).toBe(150);
    expect(paiseFromRupeesText("1.")).toBeNull();
  });
});
