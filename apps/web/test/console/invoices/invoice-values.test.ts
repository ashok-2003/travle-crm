// The invoice form's checks and its totals preview: the preview adds up as the api does (GST once on the lines' sum,
// CGST and SGST in the firm's state, IGST elsewhere), and a rate with no state is refused before anything is sent.
// @vitest-environment node
import { detail } from "./invoices-support";
import { describe, expect, it } from "vitest";
import {
  copiedInvoiceValues,
  newInvoiceValues,
  previewAmounts,
  toCreateInvoiceInput,
} from "@/console/invoices/invoice-values";

const line = (quantity: string, rate: string) => ({ quantity, rate });

describe("previewAmounts", () => {
  it("adds up each line as quantity times rate, and counts a line not yet valid as nothing", () => {
    expect(previewAmounts([line("2", "4,000"), line("3", "500")], 0, "32", null)).toMatchObject({
      subtotalPaise: 950_000,
      totalPaise: 950_000,
    });
    // A quantity of 0 or over 999, text, and an amount past ₹10 crore, count as nothing until fixed.
    for (const quantity of ["0", "1000", "x", "1.5"]) {
      expect(previewAmounts([line(quantity, "100")], 0, "32", null).subtotalPaise).toBe(0);
    }
    expect(previewAmounts([line("2", "7,00,00,000")], 0, "32", null).subtotalPaise).toBe(0);
  });

  it("splits GST in half when the billed company is in the firm's state", () => {
    expect(previewAmounts([line("1", "6,000"), line("1", "4,000")], 1800, "32", "32")).toEqual({
      subtotalPaise: 1_000_000,
      cgstPaise: 90_000,
      sgstPaise: 90_000,
      igstPaise: 0,
      totalPaise: 1_180_000,
    });
  });

  it("charges IGST in another state, and nothing without a rate", () => {
    expect(previewAmounts([line("1", "10,000")], 1800, "32", "27")).toMatchObject({
      igstPaise: 180_000,
      totalPaise: 1_180_000,
    });
    expect(previewAmounts([line("1", "10,000"), line("1", "abc")], 0, "32", null)).toMatchObject({
      subtotalPaise: 1_000_000,
      totalPaise: 1_000_000,
    });
  });
});

describe("copiedInvoiceValues", () => {
  it("makes a copy of a pre-invoice an Invoice", () => {
    expect(copiedInvoiceValues({ ...detail, kind: "proforma" }, "2026-11-26", true).kind).toBe("invoice");
  });
});

describe("toCreateInvoiceInput", () => {
  const filled = {
    ...newInvoiceValues("2026-11-26", "Pay within 7 days."),
    billToName: "Acme Holidays",
    lines: [{ description: "Starter plan", quantity: "1", rate: "10,000" }],
  };

  it("makes the api's input, leaving blank optional fields out", () => {
    expect(toCreateInvoiceInput(filled)).toEqual({
      ok: true,
      input: {
        kind: "invoice",
        issuedOn: "2026-11-26",
        billTo: { name: "Acme Holidays" },
        lines: [{ description: "Starter plan", quantity: 1, ratePaise: 1_000_000 }],
        gstRateBasisPoints: 0,
        notes: "Pay within 7 days.",
      },
    });
  });

  it("refuses a GST rate with no state, on the state field", () => {
    expect(toCreateInvoiceInput({ ...filled, gstRate: "1800" })).toEqual({
      ok: false,
      problems: { billToStateCode: "stateNeededForGst" },
    });
  });

  it("names a blank name and a line's blank description and wrong amount on their own fields", () => {
    const result = toCreateInvoiceInput({
      ...filled,
      billToName: " ",
      lines: [{ description: "", quantity: "0", rate: "0" }],
    });
    expect(result).toEqual({
      ok: false,
      problems: {
        billToName: "required",
        "lines.0.description": "required",
        "lines.0.quantity": "quantityInvalid",
        "lines.0.rate": "rateInvalid",
      },
    });
  });
});
