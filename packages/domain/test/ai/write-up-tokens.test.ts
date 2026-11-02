// The write-up's numbers are code's: tokens are filled from the quote, a typed amount is taken out and flagged.
import { describe, expect, it } from "vitest";
import { fillTokens, withoutTypedAmounts } from "../../src/ai/write-up/tokens.js";

const values = { total: "₹1,20,000.00", advance: "₹30,000.00", hasLink: true };

describe("withoutTypedAmounts", () => {
  it.each([
    "The package is ₹ 95,000 per person.",
    "The package is Rs. 95000/- per person.",
    "The package is Rs95,000 per person.",
    "The package is INR 95,000 per person.",
    "The package is 95000 rupees per person.",
    "The package is 95,000/- per person.",
  ])("removes and flags: %s", (line) => {
    const result = withoutTypedAmounts(line);
    expect(result.removed).toBe(true);
    expect(result.text).not.toMatch(/95/);
  });

  it("leaves words with no amount alone", () => {
    expect(withoutTypedAmounts("5 nights in Manali for 4 adults, 15 Dec.")).toEqual({
      text: "5 nights in Manali for 4 adults, 15 Dec.",
      removed: false,
    });
  });
});

describe("fillTokens", () => {
  it("puts the quote's total and advance in, and keeps {link} for the screen", () => {
    expect(fillTokens("Total {total}.\nAdvance {advance}.\nSee {link}", values)).toBe(
      "Total ₹1,20,000.00.\nAdvance ₹30,000.00.\nSee {link}",
    );
  });

  it("drops the line of a link a draft doesn't have, and of an advance with no schedule", () => {
    expect(
      fillTokens("Total {total}.\nAdvance {advance}.\nSee {link}", { ...values, advance: null, hasLink: false }),
    ).toBe("Total ₹1,20,000.00.");
  });

  it("leaves a token the model invented for the person to see", () => {
    expect(fillTokens("Hello {name}, total {total}", values)).toBe("Hello {name}, total ₹1,20,000.00");
  });
});
