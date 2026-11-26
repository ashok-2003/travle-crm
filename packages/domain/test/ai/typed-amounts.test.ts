// A model's typed amount is taken out and flagged; words with no amount are left alone.
import { describe, expect, it } from "vitest";
import { withoutTypedAmounts } from "../../src/ai/typed-amounts.js";

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
