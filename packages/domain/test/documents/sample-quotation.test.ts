// The sample quotation works its GST out with the tax engine and prints every amount in Indian format: CGST and SGST
// within a state, IGST between states.
import { describe, expect, it } from "vitest";
import { sampleQuotation } from "../../src/documents/index.js";
import { money } from "../../src/kernel/index.js";

const quotation = {
  recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
  supplierStateCode: "27" as const,
  lines: [
    {
      description: "Andaman islands, 6 nights",
      detail: "2 adults",
      // Tour operator services.
      sacCode: "998555",
      taxableValue: money(12_50_000_00),
      rateBasisPoints: 500,
    },
    { description: "Airport transfers", sacCode: "996601", taxableValue: money(4_999_99), rateBasisPoints: 1800 },
  ],
  branding: { organizationName: "Sharma Holidays" },
};

describe("sample quotation", () => {
  it("charges CGST and SGST within the agency's state, with every amount in Indian format", () => {
    const issued = sampleQuotation({ ...quotation, placeOfSupplyStateCode: "27" });
    expect(issued.template).toBe("sample");
    expect(issued.content.rows).toEqual([
      { description: "Andaman islands, 6 nights", detail: "2 adults · SAC 998555", amount: "₹12,50,000.00" },
      { description: "Airport transfers", detail: "SAC 996601", amount: "₹4,999.99" },
    ]);
    expect(issued.content.totals).toEqual([
      { label: "Taxable value", amount: "₹12,54,999.99" },
      { label: "CGST 2.5 %", amount: "₹31,250.00" },
      { label: "SGST 2.5 %", amount: "₹31,250.00" },
      { label: "CGST 9 %", amount: "₹450.00" },
      { label: "SGST 9 %", amount: "₹450.00" },
      { label: "Total", amount: "₹13,18,399.99", emphasis: true },
    ]);
  });

  it("charges IGST when the place of supply is another state", () => {
    const issued = sampleQuotation({ ...quotation, placeOfSupplyStateCode: "29" });
    expect(issued.content.totals.map((total) => total.label)).toEqual([
      "Taxable value",
      "IGST 5 %",
      "IGST 18 %",
      "Total",
    ]);
    expect(issued.content.totals.at(-1)).toEqual({ label: "Total", amount: "₹13,18,399.99", emphasis: true });
  });
});
