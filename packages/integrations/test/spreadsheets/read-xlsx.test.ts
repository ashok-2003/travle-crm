// Reading an .xlsx (spec B3, D10, D12): the first sheet with its name and how many there are, values as stored (a
// formula's last value, a phone typed as a number with every digit, a date cell as its day), hidden rows and merged
// cells, and an old .xls told from a password-protected workbook.
import { describe, expect, it } from "vitest";
import { createSpreadsheets, type ReadLimits, SpreadsheetUnreadableError } from "../../src/spreadsheets/index.js";
import { compoundFile, dateStyles, numberCell, rowOf, textCell, workbookOf } from "./sample-files.js";

const limits: ReadLimits = { kind: "xlsx", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 };
const spreadsheets = createSpreadsheets();
const read = (bytes: Uint8Array) => spreadsheets.read(bytes, limits);

/** One sheet named Leads with a header row of Name and Phone, then these rows. */
const leads = (rows: string, options: Parameters<typeof workbookOf>[1] = {}) =>
  workbookOf(
    [{ name: "Leads", sheetData: rowOf(1, textCell("A1", "Name") + textCell("B1", "Phone")) + rows }],
    options,
  );

async function reasonOf(bytes: Uint8Array) {
  const error: unknown = await read(bytes).catch((caught: unknown) => caught);
  return error instanceof SpreadsheetUnreadableError ? error.reason : error;
}

describe("reading an .xlsx", () => {
  it("reads the first sheet and says its name and how many there are", async () => {
    // The first sheet in the workbook's order lives in sheet3.xml, which the zip holds last.
    const bytes = workbookOf([
      {
        name: "Leads Oct",
        part: "worksheets/sheet3.xml",
        sheetData: rowOf(1, textCell("A1", "Name")) + rowOf(2, textCell("A2", "Asha")),
      },
      {
        name: "Old",
        part: "worksheets/sheet1.xml",
        sheetData: rowOf(1, textCell("A1", "Other")) + rowOf(2, textCell("A2", "x")),
      },
      { name: "Notes &amp; more", part: "worksheets/sheet2.xml", sheetData: rowOf(1, textCell("A1", "N")) },
    ]);
    const sheet = await read(bytes);
    expect(sheet).toEqual({
      sheetName: "Leads Oct",
      sheetCount: 3,
      header: ["Name"],
      rows: [{ rowNumber: 2, cells: ["Asha"] }],
    });
  });

  it("reads a formula's last value, never the formula", async () => {
    const sheet = await read(
      leads(
        rowOf(2, textCell("A2", "Asha") + `<c r="B2"><f>C2*2</f><v>84</v></c>`) +
          rowOf(3, `<c r="A3" t="str"><f>CONCATENATE("Ra","vi")</f><v>Ravi</v></c>` + `<c r="B3"><f>1/0</f></c>`),
      ),
    );
    expect(sheet.rows.map((row) => row.cells)).toEqual([
      ["Asha", "84"],
      ["Ravi", null],
    ]);
  });

  it("reads a phone typed as a number with all its digits, never 9.19876543210E+11 or .0", async () => {
    const sheet = await read(
      leads(
        rowOf(2, textCell("A2", "Asha") + numberCell("B2", "919876543210")) +
          rowOf(3, textCell("A3", "Ravi") + numberCell("B3", "9.19876543210E+11")) +
          rowOf(4, textCell("A4", "Meera") + numberCell("B4", "919876543210.0")) +
          rowOf(5, textCell("A5", "Kiran") + numberCell("B5", "2.5")) +
          rowOf(6, textCell("A6", "Dev") + `<c r="B6" t="b"><v>1</v></c>`),
      ),
    );
    expect(sheet.rows.map((row) => row.cells[1])).toEqual([
      "919876543210",
      "919876543210",
      "919876543210",
      "2.5",
      "TRUE",
    ]);
  });

  it("reads a date cell as yyyy-mm-dd", async () => {
    // 46307 is 12 Oct 2026 in Excel's serial days; 46307.75 is six in the evening that day.
    const sheet = await read(
      leads(
        rowOf(2, textCell("A2", "Asha") + numberCell("B2", "46307", 1)) +
          rowOf(3, textCell("A3", "Ravi") + numberCell("B3", "46307.75", 1)),
        {
          styles: dateStyles,
        },
      ),
    );
    expect(sheet.rows.map((row) => row.cells[1])).toEqual(["2026-10-12", "2026-10-12"]);
  });

  it("reads hidden rows, and a merged cell's value in its first cell", async () => {
    const sheet = await read(
      workbookOf([
        {
          name: "Leads",
          sheetData:
            rowOf(1, textCell("A1", "Name") + textCell("B1", "City")) +
            rowOf(2, textCell("A2", "Asha") + textCell("B2", "Goa")) +
            rowOf(3, textCell("A3", "Ravi"), ' hidden="1"'),
          after: `<mergeCells count="1"><mergeCell ref="B2:B3"/></mergeCells>`,
        },
      ]),
    );
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: ["Asha", "Goa"] },
      { rowNumber: 3, cells: ["Ravi", null] },
    ]);
  });

  it("reads shared strings, drops one leading apostrophe, and numbers rows as the sheet does", async () => {
    const sheet = await read(
      leads(
        rowOf(2, `<c r="A2" t="s"><v>0</v></c>` + `<c r="B2" t="s"><v>1</v></c>`) + rowOf(5, textCell("A5", "Ravi")),
        {
          sharedStrings: ["Asha", "'+91 98765 43210"],
        },
      ),
    );
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: ["Asha", "+91 98765 43210"] },
      { rowNumber: 5, cells: ["Ravi", null] },
    ]);
  });

  it("tells a password-protected workbook from an old .xls", async () => {
    expect(await reasonOf(compoundFile(["Workbook", "EncryptedPackage", "EncryptionInfo"]))).toBe("protected");
    expect(await reasonOf(compoundFile(["Workbook", "SummaryInformation"]))).toBe("old_excel");
  });
});
