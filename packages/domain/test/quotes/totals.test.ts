// A quote's money: GST at the quote's rate, CGST and SGST within the agency's state and IGST outside it, refused when the
// agency's GST state is not saved; and which payments due what was paid covers.
import { describe, expect, it } from "vitest";
import { coveredInstallments, quoteMoney } from "../../src/quotes/index.js";

const lines = [{ description: "Package", detail: "", quantity: 2, unitPricePaise: 500_000 }];

describe("quoteMoney", () => {
  it("charges CGST and SGST within the agency's state", () => {
    const worked = quoteMoney(lines, 500, "27", null);
    expect(worked).toMatchObject({ subtotalPaise: 1_000_000, taxPaise: 50_000, totalPaise: 1_050_000 });
    expect(worked.components.map((part) => part.name)).toEqual(["CGST", "SGST"]);
  });

  it("charges IGST when the customer is in another state or outside India", () => {
    expect(quoteMoney(lines, 500, "27", "07").components.map((part) => part.name)).toEqual(["IGST"]);
    expect(quoteMoney(lines, 1800, "27", "OUTSIDE_INDIA")).toMatchObject({ taxPaise: 180_000, totalPaise: 1_180_000 });
  });

  it("works nothing out for a quote with no GST, whatever the state", () => {
    expect(quoteMoney(lines, 0, "", null)).toMatchObject({ taxPaise: 0, totalPaise: 1_000_000, components: [] });
  });

  it("refuses tax when the agency's GST state is not saved, rather than quoting none", () => {
    expect(() => quoteMoney(lines, 500, "", null)).toThrow(expect.objectContaining({ reason: "GST_STATE_REQUIRED" }));
  });
});

describe("coveredInstallments", () => {
  const dues = [
    { amountPaise: 300_000, dueOn: "2026-12-20" },
    { amountPaise: 200_000, dueOn: "2026-11-05" },
  ];

  it("covers the earliest due first, and a part-paid one is not paid", () => {
    expect(coveredInstallments(dues, 250_000).map((due) => due.paid)).toEqual([true, false]);
    expect(coveredInstallments(dues, 150_000).map((due) => due.paid)).toEqual([false, false]);
    expect(coveredInstallments(dues, 500_000).map((due) => due.paid)).toEqual([true, true]);
  });
});
