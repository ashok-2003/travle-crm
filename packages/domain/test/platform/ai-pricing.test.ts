// The AI's prices: the listed models priced from Google's published dollars at the console's rate, a model's own version
// matched to it, the announced change from its day, the console's own price for a model not listed, and none at all.
import { describe, expect, it } from "vitest";
import { aiPricing } from "../../src/platform/ai-pricing.js";

describe("the AI's prices", () => {
  const pricing = aiPricing(96, null);
  const million = { input: 1_000_000, output: 1_000_000 };

  it("prices a listed model at the rate, whatever its prefix or version", () => {
    // $0.30 + $2.50 = $2.80 = ₹268.80
    expect(pricing.costPaise("gemini-3.5-flash-lite", "2026-11-02", million)).toBe(26_880);
    expect(pricing.costPaise("models/gemini-3.5-flash-lite-001", "2026-11-02", million)).toBe(26_880);
    expect(pricing.costPaise("google/gemini-3.8-flash", "2026-11-02", { input: 1_000_000, output: 0 })).toBe(7_200);
  });

  it("prices Gemini 3.8 Flash at double from 1 January 2027, and says so beforehand", () => {
    expect(pricing.costPaise("gemini-3.8-flash", "2027-01-01", { input: 1_000_000, output: 0 })).toBe(14_400);
    expect(pricing.table("2026-11-02").find((row) => row.model === "gemini-3.8-flash")).toEqual({
      model: "gemini-3.8-flash",
      inputUsdPerMillion: 0.75,
      outputUsdPerMillion: 3.75,
      changesOn: "2027-01-01",
      nextInputUsdPerMillion: 1.5,
      nextOutputUsdPerMillion: 7.5,
    });
  });

  it("falls back to the console's own price for a model not listed, else knows none", () => {
    expect(pricing.costPaise("some-other-model", "2026-11-02", million)).toBeNull();
    const withFallback = aiPricing(96, { inputPaisePerMillion: 100, outputPaisePerMillion: 300 });
    expect(withFallback.costPaise("some-other-model", "2026-11-02", million)).toBe(400);
  });
});
