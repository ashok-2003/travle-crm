// India GST (spec 9.6): CGST + SGST (or UTGST) within a state, IGST between states and for exports, a rate per
// line, each line's tax rounded half-up to the paisa.
import { describe, expect, it } from "vitest";
import { formatMoney, indiaGst, money, type IndiaGstInput, type TaxComponent } from "../../src/kernel/index.js";

const line = (taxableValuePaise: number, rateBasisPoints: number, sacCode = "998552") => ({
  description: "Tour package",
  sacCode,
  taxableValue: money(taxableValuePaise),
  rateBasisPoints,
});

/** Components as "CGST 9% ₹900.00", easy to read in a failing test. */
const shown = (components: readonly TaxComponent[]) =>
  components.map(
    (component) => `${component.name} ${String(component.rateBasisPoints / 100)}% ${formatMoney(component.amount)}`,
  );

describe("India GST", () => {
  it("charges CGST and SGST, half the rate each, when the place of supply is the supplier's state", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(1_000_000, 1800)],
    });
    expect(breakdown.supplyType).toBe("intra-state");
    expect(shown(breakdown.lines[0]?.components ?? [])).toEqual(["CGST 9% ₹900.00", "SGST 9% ₹900.00"]);
    expect(formatMoney(breakdown.tax)).toBe("₹1,800.00");
    expect(formatMoney(breakdown.total)).toBe("₹11,800.00");
  });

  it("charges IGST at the full rate between states", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "29",
      lines: [line(1_000_000, 1800)],
    });
    expect(breakdown.supplyType).toBe("inter-state");
    expect(shown(breakdown.components)).toEqual(["IGST 18% ₹1,800.00"]);
  });

  it("charges UTGST instead of SGST in a union territory without a legislature, and SGST in Delhi", () => {
    const chandigarh = indiaGst.compute({
      supplierStateCode: "04",
      placeOfSupplyStateCode: "04",
      lines: [line(10_000, 500)],
    });
    expect(shown(chandigarh.components)).toEqual(["CGST 2.5% ₹2.50", "UTGST 2.5% ₹2.50"]);
    const delhi = indiaGst.compute({
      supplierStateCode: "07",
      placeOfSupplyStateCode: "07",
      lines: [line(10_000, 500)],
    });
    expect(shown(delhi.components)).toEqual(["CGST 2.5% ₹2.50", "SGST 2.5% ₹2.50"]);
  });

  it("charges IGST on a supply to a place outside India", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "OUTSIDE_INDIA",
      lines: [line(50_000, 500)],
    });
    expect(breakdown.supplyType).toBe("export");
    expect(shown(breakdown.components)).toEqual(["IGST 5% ₹25.00"]);
  });

  it("rounds each half separately, so CGST always equals SGST", () => {
    // 5% of ₹100.10: each half is 250.25 paise, rounded to 250; IGST is 500.5 paise, rounded half up to 501.
    const within = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(10_010, 500)],
    });
    expect(shown(within.components)).toEqual(["CGST 2.5% ₹2.50", "SGST 2.5% ₹2.50"]);
    const between = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "24",
      lines: [line(10_010, 500)],
    });
    expect(formatMoney(between.tax)).toBe("₹5.01");
    // 250.75 paise per half rounds up to 251.
    const up = indiaGst.compute({ supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [line(10_030, 500)] });
    expect(formatMoney(up.tax)).toBe("₹5.02");
  });

  it("totals lines with different rates by component and rate, and keeps each line's own tax", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [line(1_000_000, 500), line(200_000, 1800, "998551"), line(300_000, 500)],
    });
    expect(shown(breakdown.components)).toEqual([
      "CGST 2.5% ₹325.00",
      "SGST 2.5% ₹325.00",
      "CGST 9% ₹180.00",
      "SGST 9% ₹180.00",
    ]);
    expect(breakdown.lines.map((taxed) => formatMoney(taxed.total))).toEqual(["₹10,500.00", "₹2,360.00", "₹3,150.00"]);
    expect(formatMoney(breakdown.taxableValue)).toBe("₹15,000.00");
    expect(formatMoney(breakdown.total)).toBe("₹16,010.00");
  });

  it("takes whatever rate the item has, including GST 2.0's 40% slab and zero", () => {
    const breakdown = indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: "29",
      lines: [line(100_000, 4000), line(100_000, 0)],
    });
    expect(shown(breakdown.components)).toEqual(["IGST 40% ₹400.00", "IGST 0% ₹0.00"]);
  });

  it("gives zero tax for no lines", () => {
    const breakdown = indiaGst.compute({ supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [] });
    expect(breakdown.components).toEqual([]);
    expect(breakdown.total).toEqual(money(0));
  });

  it("refuses a SAC code, a rate or a state it doesn't know", () => {
    const valid: IndiaGstInput = { supplierStateCode: "27", placeOfSupplyStateCode: "27", lines: [line(100, 500)] };
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 500, "123456")] })).toThrow(/SAC/);
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 1.5)] })).toThrow(/rate/);
    expect(() => indiaGst.compute({ ...valid, lines: [line(100, 10_001)] })).toThrow(/rate/);
    const retired = { ...valid, supplierStateCode: "25" } as unknown as IndiaGstInput;
    expect(() => indiaGst.compute(retired)).toThrow(/state code/);
  });
});
