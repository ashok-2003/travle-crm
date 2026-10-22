// The product's switches: each ships in the state the owner chose.
import { describe, expect, it } from "vitest";
import { features } from "../../src/features/index.js";

describe("features", () => {
  it("has marketingConsent false (owner, 2026-10-22)", () => {
    expect(features.marketingConsent).toBe(false);
  });
});
