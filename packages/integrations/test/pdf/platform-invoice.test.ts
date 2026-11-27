// The platform invoice template renders the firm's logo and name, the billed company, Qty × Rate rows, totals, labelled
// payment rows and the signature block, the same bytes for the same input, and refuses text the fonts can't show or an
// image that isn't the PNG or JPEG it says.
import { describe, expect, it } from "vitest";
import { renderPlatformInvoice, UnprintableTextError, type PlatformInvoiceData } from "../../src/pdf/index.js";
import { tinyJpeg, tinyPng } from "../testing.js";
import { pdfText } from "./pdf-text.js";

const issuedAt = new Date("2026-11-26T05:30:00Z");

const full: PlatformInvoiceData = {
  title: "Tax Invoice",
  number: "INV/2026-27/001",
  issuedOn: "26 Nov 2026",
  dueOn: "10 Dec 2026",
  seller: {
    name: "Test Firm",
    lines: ["1 Test Road, Delhi", "PAN: TESTP0000A", "GSTIN: TESTGSTIN0000"],
    stateLine: "Uttar Pradesh (State code: 09)",
  },
  billTo: {
    name: "Acme Holidays",
    lines: ["2 Sample Lane, Jaipur"],
    stateLine: "Rajasthan (State code: 08)",
  },
  rows: [
    {
      index: 1,
      description: "Annual subscription, Growth plan",
      quantity: 1,
      rate: "₹10,000.00",
      amount: "₹10,000.00",
    },
    { index: 2, description: "Extra seats", quantity: 5, rate: "₹500.00", amount: "₹2,500.00" },
  ],
  totals: [
    { label: "Subtotal", amount: "₹12,500.00" },
    { label: "IGST 18%", amount: "₹2,250.00" },
    { label: "Total", amount: "₹14,750.00", emphasis: true },
  ],
  totalInWords: "Rupees Fourteen Thousand Seven Hundred Fifty Only",
  payment: {
    rows: [
      { label: "Account name", value: "Test Firm" },
      { label: "Account number", value: "000011112222" },
      { label: "IFSC", value: "TEST0000001" },
      { label: "Bank", value: "Test Bank, Delhi" },
      { label: "UPI ID", value: "test@upi" },
    ],
  },
  notes: "Payable within 14 days.",
  signatory: { firm: "Test Firm", name: "Test Person", title: "Proprietor" },
  footer: "Test Firm · 1 Test Road, Delhi",
};

const minimal: PlatformInvoiceData = {
  title: "Invoice",
  number: "INV/2026-27/002",
  issuedOn: "26 Nov 2026",
  seller: { name: "Test Firm", lines: [], stateLine: "Uttar Pradesh (State code: 09)" },
  billTo: { name: "Acme Holidays", lines: [] },
  rows: [{ index: 1, description: "Setup", quantity: 1, rate: "₹500.00", amount: "₹500.00" }],
  totals: [{ label: "Total", amount: "₹500.00", emphasis: true }],
  totalInWords: "Rupees Five Hundred Only",
  payment: null,
  signatory: { firm: "Test Firm" },
  footer: "Test Firm · 1 Test Road, Delhi",
};

describe("renderPlatformInvoice", () => {
  it("renders every part of a full invoice", async () => {
    const pdf = await renderPlatformInvoice(full, issuedAt);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const { pages, text } = await pdfText(pdf);
    expect(pages).toBe(1);
    for (const part of [
      "Tax Invoice",
      "INV/2026-27/001",
      "26 Nov 2026",
      "10 Dec 2026",
      "FROM",
      "Test Firm",
      "GSTIN: TESTGSTIN0000",
      "Uttar Pradesh (State code: 09)",
      "BILLED TO",
      "Acme Holidays",
      "Rajasthan (State code: 08)",
      "Description",
      "Qty",
      "Rate",
      "Amount",
      "Annual subscription, Growth plan",
      "₹10,000.00",
      "Extra seats",
      "₹500.00",
      "₹2,500.00",
      "IGST 18%",
      "₹14,750.00",
      "Rupees Fourteen Thousand Seven Hundred Fifty Only",
      "HOW TO PAY",
      "Account name",
      "Account number",
      "000011112222",
      "IFSC",
      "Bank",
      "UPI ID",
      "test@upi",
      "Payable within 14 days.",
      "For Test Firm",
      "Test Person",
      "Proprietor",
      "Test Firm · 1 Test Road, Delhi",
      "Page 1 of 1",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("puts the firm's name, not the product's, in the header, and no 'Made with' line", async () => {
    const { text } = await pdfText(await renderPlatformInvoice(full, issuedAt));
    expect(text).not.toContain("Made with");
    expect(text).toMatch(/^Test Firm Tax Invoice/);
  });

  it("renders a minimal invoice without due date, payment, notes or signatory's name", async () => {
    const pdf = await renderPlatformInvoice(minimal, issuedAt);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const { text } = await pdfText(pdf);
    expect(text).toContain("Rupees Five Hundred Only");
    expect(text).toContain("Authorised signatory");
    for (const absent of ["Due:", "HOW TO PAY", "Notes"]) expect(text).not.toContain(absent);
  });

  it("draws a logo and a signature, a PNG and a JPEG, and the same input still gives the same bytes", async () => {
    const withImages: PlatformInvoiceData = {
      ...full,
      logo: { data: tinyPng, contentType: "image/png" },
      signature: { data: tinyJpeg, contentType: "image/jpeg" },
    };
    const plain = await renderPlatformInvoice(full, issuedAt);
    const [first, second] = await Promise.all([
      renderPlatformInvoice(withImages, issuedAt),
      renderPlatformInvoice(withImages, issuedAt),
    ]);
    expect(new TextDecoder().decode(first.subarray(0, 5))).toBe("%PDF-");
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(first.byteLength).toBeGreaterThan(plain.byteLength);
    expect((await pdfText(first)).text).toContain("Test Person");
  });

  it("refuses an image that isn't the PNG or JPEG it says", async () => {
    const renamed = new TextEncoder().encode("%PDF-1.4 not an image");
    await expect(
      renderPlatformInvoice({ ...full, logo: { data: renamed, contentType: "image/png" } }, issuedAt),
    ).rejects.toThrow(RangeError);
    await expect(
      renderPlatformInvoice({ ...full, signature: { data: tinyPng, contentType: "image/jpeg" } }, issuedAt),
    ).rejects.toThrow(RangeError);
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
