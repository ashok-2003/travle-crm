// The PDF fonts' character set: every character called printable renders and reads back as itself in each font, and
// anything else is caught before rendering, because React-PDF would print other letters in its place.
import { describe, expect, it } from "vitest";
import { printableCharacters, renderPdf, UnprintableTextError, unprintableCharacters } from "../../src/pdf/index.js";
import { pdfText } from "./pdf-text.js";

const issuedAt = new Date("2026-10-15T05:30:00Z");
const minimal = { title: "T", number: "N", issuedOn: "D", recipient: { name: "R", lines: [] }, rows: [], totals: [] };

describe("printable text", () => {
  it("renders every printable character as itself, in the title, text and number fonts", async () => {
    // Spaces would be dropped or merged by the text reader, so they are left out of the comparison. Fifteen at a time
    // fit the amount column on one line: a longer run with no space to break at would run past it.
    const characters = printableCharacters().filter((character) => character.trim() !== "");
    for (let start = 0; start < characters.length; start += 15) {
      const run = characters.slice(start, start + 15).join("");
      const pdf = await renderPdf("sample", {
        issuedAt,
        data: {
          ...minimal,
          title: run,
          recipient: { name: run, lines: [] },
          rows: [{ description: "x", amount: run }],
        },
        branding: { organizationName: "Printable" },
      });
      const text = (await pdfText(pdf)).text.replaceAll(" ", "");
      // Title font (the title), text font (the recipient) and number font (the amount).
      expect(text.split(run).length - 1, run).toBe(3);
    }
  });

  it("names the characters it can't print, once each, and allows line breaks", () => {
    expect(unprintableCharacters("Hotel होटल, होटल ₹4,000\nPaid ✅")).toEqual(["ह", "ो", "ट", "ल", "✅"]);
    expect(unprintableCharacters("Ūdaipur – “Lake palace” ₹12,50,000…\n")).toEqual([]);
  });

  it("refuses to render a document with text the fonts can't show, rather than print other letters", async () => {
    const hindi = { ...minimal, rows: [{ description: "होटल और नाश्ता", amount: "₹4,000.00" }] };
    const attempt = renderPdf("sample", { issuedAt, data: hindi, branding: { organizationName: "Sharma Holidays" } });
    await expect(attempt).rejects.toBeInstanceOf(UnprintableTextError);
    await expect(attempt).rejects.toThrow(/can't show yet: ह \(U\+0939\), ो \(U\+094B\), ट \(U\+091F\)/);
  });
});

describe("printable text normalisation", () => {
  const withName = (name: string) => ({
    issuedAt,
    data: { ...minimal, recipient: { name, lines: [] } },
    branding: { organizationName: "Printable" },
  });

  it("accepts decomposed accents and renders them composed", async () => {
    expect(unprintableCharacters("Ūdaipur".normalize("NFD"))).toEqual([]);
    const { text } = await pdfText(await renderPdf("sample", withName("Café José")));
    expect(text).toContain("Café José");
  });

  it("treats CRLF and lone CR as line breaks", async () => {
    expect(unprintableCharacters("a\r\nb\rc")).toEqual([]);
    const pdf = await renderPdf("sample", {
      issuedAt,
      data: { ...minimal, notes: "one\r\ntwo\rthree" },
      branding: { organizationName: "Printable" },
    });
    expect((await pdfText(pdf)).text).toContain("one two three");
  });

  it("shows a refused character as its code point, and gives the error a stable code", async () => {
    const attempt = renderPdf("sample", withName("Zero​width"));
    await expect(attempt).rejects.toThrow(/U\+200B/);
    await expect(attempt).rejects.toMatchObject({ code: "UNPRINTABLE_TEXT", characters: ["​"] });
  });
});
