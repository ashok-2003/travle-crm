// The platform invoice template renders the firm, the billed company, rows, totals and payment details, the same
// bytes for the same input, and refuses text the fonts can't show.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderPlatformInvoice, UnprintableTextError, type PlatformInvoiceData } from "../../src/pdf/index.js";
import { pdfText } from "./pdf-text.js";

const issuedAt = new Date("2026-11-26T05:30:00Z");

const full: PlatformInvoiceData = {
  title: "Tax Invoice",
  number: "INV/2026-27/001",
  issuedOn: "26 Nov 2026",
  dueOn: "10 Dec 2026",
  seller: { name: "Test Firm", lines: ["1 Test Road, Delhi", "PAN: TESTP0000A", "GSTIN: TESTGSTIN0000"] },
  billTo: { name: "Acme Holidays", lines: ["2 Sample Lane, Jaipur", "Rajasthan (08)"] },
  rows: [
    { description: "Annual subscription, Growth plan", amount: "₹10,000.00" },
    { description: "Extra seats", amount: "₹2,500.00" },
  ],
  totals: [
    { label: "Subtotal", amount: "₹12,500.00" },
    { label: "IGST 18%", amount: "₹2,250.00" },
    { label: "Total", amount: "₹14,750.00", emphasis: true },
  ],
  totalInWords: "Rupees Fourteen Thousand Seven Hundred Fifty Only",
  payment: { lines: ["Account: 000011112222, IFSC TEST0000001", "UPI: test@upi"] },
  notes: "Payable within 14 days.",
  signatory: "For Test Firm",
};

const minimal: PlatformInvoiceData = {
  title: "Invoice",
  number: "INV/2026-27/002",
  issuedOn: "26 Nov 2026",
  seller: { name: "Test Firm", lines: [] },
  billTo: { name: "Acme Holidays", lines: [] },
  rows: [{ description: "Setup", amount: "₹500.00" }],
  totals: [{ label: "Total", amount: "₹500.00", emphasis: true }],
  totalInWords: "Rupees Five Hundred Only",
  payment: null,
  signatory: "For Test Firm",
};

describe("renderPlatformInvoice", () => {
  it("renders every part of a full invoice", async () => {
    const pdf = await renderPlatformInvoice(full, issuedAt);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const { pages, text } = await pdfText(pdf);
    expect(pages).toBe(1);
    for (const part of [
      brand.productName,
      "Tax Invoice",
      "INV/2026-27/001",
      "26 Nov 2026",
      "10 Dec 2026",
      "FROM",
      "Test Firm",
      "GSTIN: TESTGSTIN0000",
      "BILLED TO",
      "Acme Holidays",
      "Annual subscription, Growth plan",
      "₹10,000.00",
      "Extra seats",
      "IGST 18%",
      "₹14,750.00",
      "Rupees Fourteen Thousand Seven Hundred Fifty Only",
      "HOW TO PAY",
      "Account: 000011112222, IFSC TEST0000001",
      "UPI: test@upi",
      "Payable within 14 days.",
      "For Test Firm",
      "Authorised signatory",
      "Page 1 of 1",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("renders a minimal invoice without due date, payment or notes", async () => {
    const pdf = await renderPlatformInvoice(minimal, issuedAt);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const { text } = await pdfText(pdf);
    expect(text).toContain("Rupees Five Hundred Only");
    for (const absent of ["Due:", "HOW TO PAY", "Notes"]) expect(text).not.toContain(absent);
  });

  it("renders the same bytes for the same input and issue time", async () => {
    const [first, second] = await Promise.all([
      renderPlatformInvoice(full, issuedAt),
      renderPlatformInvoice(full, issuedAt),
    ]);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("refuses text the fonts can't show", async () => {
    const data = { ...full, billTo: { name: "Acme \u{1F600} Holidays", lines: [] } };
    await expect(renderPlatformInvoice(data, issuedAt)).rejects.toThrow(UnprintableTextError);
  });
});
