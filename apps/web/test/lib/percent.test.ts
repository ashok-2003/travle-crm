// A share typed as a percentage and its basis points, both ways: whole basis points only, so a rate is never a float.
import { describe, expect, it } from "vitest";
import { basisPointsOf, percentText } from "@/lib/percent";

describe("a percentage as basis points", () => {
  it("reads whole and two-decimal shares, positive and negative", () => {
    expect(basisPointsOf("5")).toBe(500);
    expect(basisPointsOf("12.5")).toBe(1250);
    expect(basisPointsOf("12.55")).toBe(1255);
    expect(basisPointsOf("-2.5")).toBe(-250);
    expect(basisPointsOf(" 0 ")).toBe(0);
    expect(basisPointsOf("100")).toBe(10_000);
  });

  it("reads nothing else", () => {
    for (const text of ["", "x", "5%", "1.234", "1,5", ".5", "5.", "1000", "--1"]) {
      expect(basisPointsOf(text), text).toBeNull();
    }
  });

  it("shows basis points as a person types them, and reads them back", () => {
    for (const [basisPoints, text] of [
      [500, "5"],
      [1250, "12.5"],
      [1255, "12.55"],
      [-250, "-2.5"],
      [0, "0"],
      [909, "9.09"],
    ] as const) {
      expect(percentText(basisPoints)).toBe(text);
      expect(basisPointsOf(text)).toBe(basisPoints);
    }
  });
});
