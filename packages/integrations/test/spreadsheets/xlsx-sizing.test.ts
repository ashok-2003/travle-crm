// The pre-inflate sizes a workbook as an XML parser reads it (D1, B4): read-excel-file reads its rows and cells with a
// SAX parser, so a sheet that a pattern would misread (a ">" or single quotes in an attribute, a namespace prefix, a
// comment, CDATA, a processing instruction, an entity in a cell's address) must still be refused before the reader
// pads it out, and quickly, with little memory. The first sheet is found the same way the reader finds it.
import { strToU8, Zip, ZipPassThrough, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  createSpreadsheets,
  type ReadLimits,
  SpreadsheetUnreadableError,
  type UnreadableReason,
} from "../../src/spreadsheets/index.js";
import { sheetSizer } from "../../src/spreadsheets/sheet-sizer.js";
import { rowOf, textCell, workbookOf, workbookParts } from "./sample-files.js";

const spreadsheets = createSpreadsheets();
const limits: ReadLimits = { kind: "xlsx", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 };
const header = rowOf(1, textCell("A1", "Name"));
const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

async function reasonOf(bytes: Uint8Array): Promise<UnreadableReason | "read"> {
  try {
    await spreadsheets.read(bytes, limits);
    return "read";
  } catch (error) {
    if (error instanceof SpreadsheetUnreadableError) return error.reason;
    throw error;
  }
}

/** A one-sheet workbook whose sheetData is this XML after the header row. */
const sheetOf = (rows: string) => workbookOf([{ name: "Leads", sheetData: header + rows }]);

/** The sizer's own verdict on a sheet part's XML, before the reader is asked (as the pre-inflate sizes it). */
function sizerRefusal(sheetData: string): UnreadableReason | null {
  const sizer = sheetSizer({ maxRowNumber: limits.maxRows * 2 + 1, maxColumn: limits.maxColumns });
  sizer.push(
    strToU8(`<worksheet xmlns="${spreadsheetNamespace}"><sheetData>${sheetData}</sheetData></worksheet>`),
    true,
  );
  return sizer.size.refusal;
}

/** Refused for `reason` within two seconds. */
async function expectRefused(bytes: Uint8Array, reason: UnreadableReason) {
  const started = performance.now();
  expect(await reasonOf(bytes)).toBe(reason);
  expect(performance.now() - started).toBeLessThan(2000);
}

describe("sizing a workbook as an XML parser reads it", () => {
  it("refuses the reviewer's probe, a '>' inside an attribute hiding row 400,000, fast and with little memory", async () => {
    const probe = sheetOf(`<row a=">" r="400000"><c a=">" r="XFD400000"><v>1</v></c></row>`);
    const before = process.memoryUsage().heapUsed;
    await expectRefused(probe, "too_many_rows");
    expect((process.memoryUsage().heapUsed - before) / (1024 * 1024)).toBeLessThan(64);
    await expectRefused(sheetOf(`<row r="2"><c a=">" r="XFD2"><v>1</v></c></row>`), "too_many_columns");
  });

  it("reads single-quoted attributes", async () => {
    await expectRefused(sheetOf(`<row r='1048576'><c r='A1048576'><v>1</v></c></row>`), "too_many_rows");
    await expectRefused(sheetOf(`<row r='2'><c r='XFD2'><v>1</v></c></row>`), "too_many_columns");
  });

  it("reads elements and attributes under any namespace prefix, as the reader drops them", async () => {
    const prefixed = `<x:row xmlns:x="${spreadsheetNamespace}" r="1048576"><x:c r="A1048576"><x:v>1</x:v></x:c></x:row>`;
    await expectRefused(sheetOf(prefixed), "too_many_rows");
    await expectRefused(sheetOf(`<row r="2"><c xmlns:y="urn:y" y:r="XFD2"><v>1</v></c></row>`), "too_many_columns");
  });

  it("decodes a cell address's entities, as the reader does", async () => {
    await expectRefused(sheetOf(`<row r="2"><c r="X&#70;D2"><v>1</v></c></row>`), "too_many_columns");
    await expectRefused(sheetOf(`<row r="&#49;048576"><c r="A1048576"><v>1</v></c></row>`), "too_many_rows");
  });

  it("isn't fooled by comments, CDATA or processing instructions holding tags, quotes or '>'", async () => {
    await expectRefused(sheetOf(`<!-- <row r="2"> " ' > <c r=" -->${rowOf(1_048_576, "")}`), "too_many_rows");
    const cdata = `<c r="A2" t="inlineStr"><is><t><![CDATA[ <c r="A2"> " > ]]></t></is></c><c r="XFD2"><v>1</v></c>`;
    await expectRefused(sheetOf(rowOf(2, cdata)), "too_many_columns");
    await expectRefused(sheetOf(`<?pi a=">" ' ?>${rowOf(1_048_576, "")}`), "too_many_rows");
  });

  it("counts rows without a number, and takes a row's number from its cell's address", async () => {
    await expectRefused(sheetOf("<row/>".repeat(20_001)), "too_many_rows");
    await expectRefused(sheetOf(`<row><c r="A1048576"><v>1</v></c></row>`), "too_many_rows");
  });

  it("refuses broken XML and a tag no spreadsheet writes, a megabyte long", async () => {
    await expectRefused(sheetOf(`<row r="2"><c r="A2"><v>1</v></c>`), "not_a_spreadsheet");
    await expectRefused(sheetOf(`<row r="2" a="${"x".repeat(2 * 1024 * 1024)}"></row>`), "not_a_spreadsheet");
  });

  it("still reads an ordinary sheet whose cells say nothing odd", async () => {
    const ordinary = sheetOf(`<row r='2'><c r="A2" t="inlineStr"><is><t>Asha &amp; Ravi</t></is></c></row>`);
    expect(await reasonOf(ordinary)).toBe("read");
  });

  it("finds the first sheet as the reader does, past a commented-out decoy, and refuses an ambiguous one", async () => {
    const parts = workbookParts([
      { name: "Big", sheetData: header + rowOf(1_048_576, textCell("A1048576", "x")) },
      { name: "Small", sheetData: header + rowOf(2, textCell("A2", "Asha")) },
    ]);
    const withWorkbook = (sheets: string) =>
      zipSync({
        ...parts,
        "xl/workbook.xml": strToU8(
          `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><sheets>${sheets}</sheets></workbook>`,
        ),
      });
    const decoy = `<!-- <sheet name="Small" sheetId="2" r:id="rId2"/> -->`;
    await expectRefused(
      withWorkbook(`${decoy}<sheet name="Big" sheetId="1" r:id="rId1"/><sheet name="Small" sheetId="2" r:id="rId2"/>`),
      "too_many_rows",
    );
    await expectRefused(
      withWorkbook(`<sheet name='Big' sheetId='1' r:id='rId1'/><sheet name="Small" sheetId="2" r:id="rId2"/>`),
      "too_many_rows",
    );
    // Two ids for one sheet: which one the reader takes depends on its parser, so it is refused.
    await expectRefused(
      withWorkbook(`<sheet name="Small" sheetId="2" r:id="rId2" xmlns:q="urn:q" q:id="rId1"/>`),
      "not_a_spreadsheet",
    );
  });

  it("reads names under an xmlns: prefix as the reader does, which drops the prefix too (round 2)", () => {
    expect(sizerRefusal(`<row r="2"><c xmlns:x:r="XFD2"><v>1</v></c></row>`)).toBe("too_many_columns");
    expect(sizerRefusal(`<row r="2"><xmlns:c r="XFD2"><v>1</v></xmlns:c></row>`)).toBe("too_many_columns");
    expect(sizerRefusal(`<row xmlns:x:r="400000"><c><v>1</v></c></row>`)).toBe("too_many_rows");
    expect(sizerRefusal(`<xmlns:row r="400000"><c><v>1</v></c></xmlns:row>`)).toBe("too_many_rows");
  });

  it("refuses the re-reviewer's 15 KB file of 3,000 prefixed rows, fast and with little memory", async () => {
    const rows = Array.from(
      { length: 3000 },
      (_, index) => `<row r="${String(index + 2)}"><c xmlns:x:r="XFD${String(index + 2)}"><v>1</v></c></row>`,
    ).join("");
    const before = process.memoryUsage().heapUsed;
    await expectRefused(sheetOf(rows), "too_many_columns");
    expect((process.memoryUsage().heapUsed - before) / (1024 * 1024)).toBeLessThan(64);
  });

  it("refuses elements nested past a hundred deep, as no sheet nests them, before they cost memory (item 4)", () => {
    expect(sizerRefusal(`${"<a>".repeat(95)}${"</a>".repeat(95)}${rowOf(2, textCell("A2", "Asha"))}`)).toBeNull();
    expect(sizerRefusal("<a>".repeat(101))).toBe("not_a_spreadsheet");
    const nested = "<a>".repeat(2_000_000);
    const before = process.memoryUsage().heapUsed;
    expect(sizerRefusal(nested)).toBe("not_a_spreadsheet");
    expect((process.memoryUsage().heapUsed - before) / (1024 * 1024)).toBeLessThan(32);
  });

  it("counts a number the reader decodes twice, when a prefixed name comes before the plain one", () => {
    // The reader decodes x:r's value into r, then decodes r once more: its row 400,000, its column XFD.
    expect(sizerRefusal(`<row x:r="&amp;#52;00000" r="2"><c r="A2"><v>1</v></c></row>`)).toBe("too_many_rows");
    expect(sizerRefusal(`<row r="2"><c x:r="&amp;#88;FD2" r="A2"><v>1</v></c></row>`)).toBe("too_many_columns");
  });

  it("refuses an archive holding a part twice, whichever copy the reader would take (item 11)", async () => {
    const parts = workbookParts([{ name: "Leads", sheetData: header + rowOf(2, textCell("A2", "Asha")) }]);
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, chunk) => {
      if (error) throw error;
      chunks.push(chunk);
    });
    const add = (name: string, bytes: Uint8Array) => {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(bytes, true);
    };
    for (const [name, bytes] of Object.entries(parts)) add(name, bytes);
    add("xl/worksheets/sheet1.xml", strToU8(`<worksheet><sheetData>${rowOf(1_048_576, "")}</sheetData></worksheet>`));
    zip.end();
    await expectRefused(Buffer.concat(chunks), "not_a_spreadsheet");
  });

  it("reads a sheet spaced out over megabytes, and refuses a megabyte of nothing but space (item 11)", async () => {
    const spacious = Array.from({ length: 2000 }, (_, index) =>
      rowOf(index + 2, `${" ".repeat(500)}${textCell(`A${String(index + 2)}`, "Asha")}${" ".repeat(500)}`),
    ).join("\n".repeat(100));
    expect(await reasonOf(sheetOf(spacious))).toBe("read");
    await expectRefused(
      sheetOf(`${rowOf(2, textCell("A2", "Asha"))}${" ".repeat(2 * 1024 * 1024)}`),
      "not_a_spreadsheet",
    );
  });

  it("sizes the first sheet where its part really is, not where a first sheet usually is (item 11)", async () => {
    const workbook = (first: string, second: string) =>
      workbookOf([
        { name: "First", part: "worksheets/sheet3.xml", sheetData: header + first },
        { name: "Second", part: "worksheets/sheet1.xml", sheetData: header + second },
      ]);
    const far = rowOf(1_048_576, textCell("A1048576", "x"));
    const near = rowOf(2, textCell("A2", "Asha"));
    await expectRefused(workbook(far, near), "too_many_rows");
    expect(await reasonOf(workbook(near, far))).toBe("read");
  });

  it("reads at most 10,000 elements of workbook.xml and of its relationships, and no cap on a sheet (X8)", async () => {
    const parts = workbookParts([{ name: "Leads", sheetData: header + rowOf(2, textCell("A2", "Asha")) }]);
    const crowded = (name: string, closing: string) => {
      const text = new TextDecoder().decode(parts[name]);
      return { ...parts, [name]: strToU8(text.replace(closing, `${"<a/>".repeat(10_000)}${closing}`)) };
    };
    await expectRefused(zipSync(crowded("xl/workbook.xml", "</workbook>")), "not_a_spreadsheet");
    await expectRefused(zipSync(crowded("xl/_rels/workbook.xml.rels", "</Relationships>")), "not_a_spreadsheet");
    const busy = Array.from({ length: 2000 }, (_, index) =>
      rowOf(
        index + 2,
        [0, 1, 2, 3, 4].map((column) => textCell(`${"ABCDE"[column] ?? "A"}${String(index + 2)}`, "x")).join(""),
      ),
    ).join("");
    expect(await reasonOf(sheetOf(busy))).toBe("read");
  });
});
