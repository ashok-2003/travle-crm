// A workbook part's elements as read-excel-file sees them (D1): only the elements asked for are kept, so a part of
// millions of others costs little memory.
import { describe, expect, it } from "vitest";
import { readerElementsOf } from "../../src/spreadsheets/xml-elements.js";

const megabytes = (bytes: number) => bytes / (1024 * 1024);

describe("readerElementsOf", () => {
  it("keeps only the elements asked for, so a workbook.xml of millions of others costs little (item 3)", () => {
    const xml = `<workbook><sheets><sheet name="Leads" r:id="rId1"/></sheets>${"<a/>".repeat(3_000_000)}</workbook>`;
    const before = process.memoryUsage().heapUsed;
    const sheets = readerElementsOf(xml, new Set(["sheet"]));
    expect(megabytes(process.memoryUsage().heapUsed - before)).toBeLessThan(64);
    expect(sheets).toEqual([{ name: "sheet", attributes: { name: "Leads", id: "rId1" }, ambiguous: false }]);
  });
});
