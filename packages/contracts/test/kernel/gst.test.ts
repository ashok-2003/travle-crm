// GST registration facts: the state codes GSTINs start with, and GSTINs themselves, checked to the last character.
import { describe, expect, it } from "vitest";
import {
  gstStateCode,
  gstStateCodeFromGstin,
  gstStates,
  gstin,
  gstinCheckCharacter,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
} from "../../src/kernel/index.js";

/** The GST Network's own sample GSTIN, used in its API documentation. */
const SAMPLE_GSTIN = "27AAPFU0939F1ZV";

describe("GST states", () => {
  it("lists every state and union territory once, by its two-digit GST code", () => {
    const codes = gstStates.map((state) => state.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\d{2}$/);
    expect(gstStates.find((state) => state.code === "36")?.name).toBe("Telangana");
    expect(gstStates.find((state) => state.code === "37")?.name).toBe("Andhra Pradesh");
    expect(gstStates.find((state) => state.code === "38")?.name).toBe("Ladakh");
    // Retired codes: Daman and Diu (now 26) and undivided Andhra Pradesh.
    expect(codes).not.toContain("25");
    expect(codes).not.toContain("28");
  });

  it("knows which union territories pay UTGST", () => {
    const utgst = gstStates
      .filter((state) => isUnionTerritoryWithoutLegislature(state.code))
      .map((state) => state.code);
    expect(utgst).toEqual(["04", "26", "31", "35", "38", "97"]);
    expect(isUnionTerritoryWithoutLegislature("07")).toBe(false);
    expect(isUnionTerritoryWithoutLegislature("34")).toBe(false);
  });
});

describe("GSTIN", () => {
  it("accepts a GSTIN whose check character matches, and gives its state", () => {
    expect(isValidGstin(SAMPLE_GSTIN)).toBe(true);
    expect(gstinCheckCharacter(SAMPLE_GSTIN.slice(0, 14))).toBe("V");
    expect(gstStateCodeFromGstin(SAMPLE_GSTIN)).toBe("27");
  });

  it("refuses a wrong check character, a bad shape or a state that doesn't exist", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(false);
    const retiredState = `25AAPFU0939F1Z`;
    expect(isValidGstin(retiredState + gstinCheckCharacter(retiredState))).toBe(false);
    expect(() => gstStateCodeFromGstin("27AAPFU0939F1ZW")).toThrow(RangeError);
  });

  it("reads a typed GSTIN in any case", () => {
    expect(gstin.parse(" 27aapfu0939f1zv ")).toBe(SAMPLE_GSTIN);
    expect(gstin.safeParse("27AAPFU0939F1ZW").success).toBe(false);
  });
});

describe("more GSTINs and fields", () => {
  it("accept GSTINs verified with the checksum", () => {
    for (const valid of ["29AAICA3918J1ZE", "27AAACR5055K1Z7", "29AACCF0683K1ZD"]) {
      expect(isValidGstin(valid), valid).toBe(true);
    }
  });

  it("only compute a check character for 14 capitals or digits", () => {
    for (const bad of ["", "27AAPFU0939F1", "27aapfu0939f1z", "27AAPFU0939F1ZV", "27AAPFU0939F1!"]) {
      expect(() => gstinCheckCharacter(bad), bad).toThrow(RangeError);
    }
  });

  it("have a state code field", () => {
    expect(gstStateCode.parse("27")).toBe("27");
    expect(gstStateCode.safeParse("25").success).toBe(false);
    expect(gstStateCode.safeParse("7").success).toBe(false);
  });
});
