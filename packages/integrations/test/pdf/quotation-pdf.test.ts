// The quotation template prints what the quote page does: the whole trip name, the date and people in words, whole
// rupees, a total with its GST note and no tax table, the days, inclusions, exclusions, notes and terms.
import { describe, expect, it } from "vitest";
import { renderPdf, type QuotationDocumentData } from "../../src/pdf/index.js";
import { pdfText } from "./pdf-text.js";

const issuedAt = new Date("2026-11-27T05:30:00Z");
const tripName = "Manali, Sissu and Kasol: Strangers Trip (5N/6D) from Delhi with a very long name indeed";

const quotation: QuotationDocumentData = {
  title: tripName,
  number: "QT-2026-0007",
  issuedOn: "27 Nov 2026",
  customer: "Meera Iyer",
  when: "Fri 4 Dec 2026 · 1 adult",
  lines: [{ description: "Strangers Trip × 1", detail: "Shared tempo traveller", amount: "₹8,570" }],
  gst: { label: "GST 5%", amount: "₹429" },
  total: "₹8,999",
  totalNote: "incl. 5% GST",
  dues: [{ label: "Advance", by: "1 Dec 2026", amount: "₹3,000" }],
  days: [{ title: "Delhi to Manali", description: "Overnight Volvo, arrive by morning." }, { title: "Sissu" }],
  inclusions: ["Stay in a hotel", "Breakfast and dinner"],
  exclusions: ["Lunch", "Personal expenses"],
  notes: ["Carry a warm jacket"],
};
const branding = { organizationName: "Sharma Holidays", terms: "50% to book, the balance 30 days before travel." };

describe("the quotation template", () => {
  it("prints the trip, the price, the days and the points, in words and whole rupees", async () => {
    const pdf = await renderPdf("quotation", { issuedAt, data: quotation, branding });
    const { text } = await pdfText(pdf);
    for (const part of [
      "Sharma Holidays",
      "QT-2026-0007",
      "To: Meera Iyer",
      tripName,
      "Fri 4 Dec 2026 · 1 adult",
      "Strangers Trip × 1",
      "₹8,570",
      "GST 5%",
      "₹429",
      "Total ₹8,999 (incl. 5% GST)",
      "Advance",
      "By 1 Dec 2026",
      "₹3,000",
      "Day 1: Delhi to Manali",
      "Overnight Volvo, arrive by morning.",
      "Day 2: Sissu",
      "Stay in a hotel",
      "Not included",
      "Personal expenses",
      "Carry a warm jacket",
      "50% to book, the balance 30 days before travel.",
    ]) {
      expect(text, part).toContain(part);
    }
    expect(text).not.toContain("…");
    expect(text).not.toMatch(/CGST|SGST|Taxable/);
    expect(text).not.toMatch(/\.\d\d/);
  });

  it("leaves out the parts a quotation does not have", async () => {
    const bare = {
      ...quotation,
      gst: undefined,
      totalNote: undefined,
      dues: [],
      days: [],
      inclusions: [],
      exclusions: [],
      notes: [],
    };
    const { text } = await pdfText(
      await renderPdf("quotation", { issuedAt, data: bare, branding: { organizationName: "Sharma Holidays" } }),
    );
    expect(text).toContain("Total ₹8,999");
    expect(text).not.toMatch(/GST|incl\.|To pay|day by day|Included|Not included|Notes|Terms/);
  });

  it("refuses the sample's content", async () => {
    const sample = {
      title: "x",
      number: "n",
      issuedOn: "d",
      recipient: { name: "a", lines: [] },
      rows: [],
      totals: [],
    };
    await expect(renderPdf("quotation", { issuedAt, data: sample, branding })).rejects.toThrow(TypeError);
  });
});
