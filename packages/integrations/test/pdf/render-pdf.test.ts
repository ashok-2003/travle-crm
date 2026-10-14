// The sample template renders the organization's branding and the document's content, pages long documents, and
// refuses an accent colour that isn't a hex colour.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { renderPdf, type SampleDocumentData } from "../../src/pdf/index.js";
import { firstPageText, pdfText } from "./pdf-text.js";

/** A 1x1 transparent PNG: the smallest valid logo. */
const tinyPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

const issuedAt = new Date("2026-10-15T05:30:00Z");

const sample: SampleDocumentData = {
  title: "Quotation",
  number: "DOC-2026-0042",
  issuedOn: "15 Oct 2026",
  recipient: { name: "Meera Iyer", lines: ["14 Marine Drive", "Mumbai 400002"] },
  rows: [
    { description: "Andaman islands, 6 nights", detail: "2 adults, sea-view room", amount: "₹12,50,000.00" },
    { description: "Airport transfers", amount: "₹8,500.00" },
  ],
  totals: [
    { label: "Taxable value", amount: "₹12,58,500.00" },
    { label: "Total", amount: "₹13,21,425.00", emphasis: true },
  ],
  notes: "Prices hold for seven days.",
};

const branding = {
  organizationName: "Sharma Holidays",
  accentColour: "#034f46",
  terms: "50% to book, the balance 30 days before travel.",
};

describe("renderPdf", () => {
  it("renders the sample with the organization's branding and every part of the document", async () => {
    const pdf = await renderPdf("sample", { issuedAt, data: sample, branding });
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");

    const { pages, text } = await pdfText(pdf);
    expect(pages).toBe(1);
    for (const part of [
      "Sharma Holidays",
      "Quotation",
      "DOC-2026-0042",
      "15 Oct 2026",
      "Meera Iyer",
      "Mumbai 400002",
      "Andaman islands, 6 nights",
      "2 adults, sea-view room",
      "₹12,50,000.00",
      "₹13,21,425.00",
      "Prices hold for seven days.",
      "50% to book, the balance 30 days before travel.",
      `Made with ${brand.productName}`,
      "Page 1 of 1",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("carries a long document over several pages, numbering each", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      description: `Day ${String(index + 1)}: sightseeing`,
      amount: "₹2,500.00",
    }));
    const { pages, text } = await pdfText(await renderPdf("sample", { issuedAt, data: { ...sample, rows }, branding }));
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`Page 1 of ${String(pages)}`);
    expect(text).toContain(`Page ${String(pages)} of ${String(pages)}`);
    expect(text).toContain("Day 60: sightseeing");
  });

  it("keeps a long description inside its column and an amount on one line", async () => {
    const description =
      "Six nights in a sea-view cottage at Havelock with breakfast and dinner, a private transfer from Port Blair " +
      "jetty, a guided snorkelling trip at Elephant beach and a sunset cruise on the last evening";
    const rows = [{ description, amount: "₹1,23,45,67,890.00" }];
    const placed = await firstPageText(await renderPdf("sample", { issuedAt, data: { ...sample, rows }, branding }));

    // ₹ comes from the latin-ext font, so it is its own run: it must sit just left of the digits, on their line.
    const digits = placed.find((item) => item.text.includes("1,23,45,67,890.00"));
    const rupee = placed.find(
      (item) =>
        item.text === "₹" && digits && Math.abs(item.y - digits.y) < 1 && Math.abs(item.x + item.width - digits.x) < 2,
    );
    expect(rupee).toBeDefined();
    const amountStarts = rupee?.x ?? 0;
    const descriptionLines = placed.filter((item) => description.includes(item.text.trim()) && item.text.trim() !== "");
    expect(descriptionLines.length).toBeGreaterThan(1);
    for (const line of descriptionLines) expect(line.x + line.width, line.text).toBeLessThan(amountStarts);
  });

  it("renders a logo, and works without one or without terms", async () => {
    const withLogo = await renderPdf("sample", {
      issuedAt,
      data: sample,
      branding: { ...branding, logo: { data: tinyPng, contentType: "image/png" } },
    });
    expect(new TextDecoder("latin1").decode(withLogo)).toContain("/Subtype /Image");
    const plain = await pdfText(
      await renderPdf("sample", { issuedAt, data: sample, branding: { organizationName: "Goa Escapes" } }),
    );
    expect(plain.text).toContain("Goa Escapes");
  });

  it("refuses an accent colour that isn't #rrggbb", async () => {
    await expect(
      renderPdf("sample", { issuedAt, data: sample, branding: { ...branding, accentColour: "red; font-size: 400" } }),
    ).rejects.toThrow(/Accent colours look like/);
  });
});

describe("renderPdf output", () => {
  it("depends only on its input: the same document renders to the same bytes, a different issue time does not", async () => {
    const first = await renderPdf("sample", { issuedAt, data: sample, branding });
    const second = await renderPdf("sample", { issuedAt, data: sample, branding });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);

    const later = await renderPdf("sample", { issuedAt: new Date("2026-10-16T05:30:00Z"), data: sample, branding });
    expect(Buffer.from(first).equals(Buffer.from(later))).toBe(false);
  });

  it("embeds the three brand fonts rather than falling back to a standard one", async () => {
    const raw = new TextDecoder("latin1").decode(await renderPdf("sample", { issuedAt, data: sample, branding }));
    const baseFonts = [...raw.matchAll(/\/BaseFont \/[A-Z]{6}\+([A-Za-z0-9-]+)/g)].map((match) => match[1] ?? "");
    for (const family of ["EBGaramond", "Figtree", "IBMPlexMono"]) {
      expect(
        baseFonts.some((name) => name.startsWith(family)),
        family,
      ).toBe(true);
    }
    expect(raw).not.toContain("/BaseFont /Helvetica");
  });

  it("refuses a logo that isn't a PNG or JPEG", async () => {
    const logo = { data: tinyPng, contentType: "image/svg+xml" } as unknown as {
      data: Uint8Array;
      contentType: "image/png";
    };
    await expect(renderPdf("sample", { issuedAt, data: sample, branding: { ...branding, logo } })).rejects.toThrow(
      RangeError,
    );
  });
});
