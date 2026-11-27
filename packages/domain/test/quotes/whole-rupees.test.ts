// The whole-rupee price: lines rounded to the rupee, one GST row that is the total less those lines, so the rows add up.
import { describe, expect, it } from "vitest";
import { gstLabel, wholeRupeePrice } from "../../src/quotes/whole-rupees.js";

describe("wholeRupeePrice", () => {
  it("rounds each line and makes the GST row the total less the rounded lines", () => {
    const price = wholeRupeePrice([857_048, 120_030], 1_026_000, 48_922);
    expect(price.linesPaise).toEqual([857_000, 120_000]);
    expect(price.gstPaise).toBe(1_026_000 - 977_000);
    expect(price.linesPaise.reduce((sum, paise) => sum + paise, 0) + (price.gstPaise ?? 0)).toBe(1_026_000);
  });

  it("has no GST row without tax", () => {
    expect(wholeRupeePrice([850_000], 850_000, 0)).toEqual({ linesPaise: [850_000], gstPaise: null });
  });

  it("names the rate, with a half rate's decimal", () => {
    expect(gstLabel(500)).toBe("GST 5%");
    expect(gstLabel(250)).toBe("GST 2.5%");
  });
});
