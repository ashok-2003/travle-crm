// Reading is bounded (spec B2, B4, B5): a zip bomb, a million rows and a 10 MB cell cost no more than the limits allow,
// and every file that can't be read says which of B5's reasons it is.
import { describe, expect, it } from "vitest";
import {
  createSpreadsheets,
  type ReadLimits,
  SpreadsheetUnreadableError,
  type UnreadableReason,
} from "../../src/spreadsheets/index.js";
import { millionRowWorkbook, rowOf, textCell, workbookOf, zipBomb } from "./sample-files.js";

const spreadsheets = createSpreadsheets();
const csvLimits: ReadLimits = { kind: "csv", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 };
const xlsxLimits: ReadLimits = { ...csvLimits, kind: "xlsx" };
const megabytes = (bytes: number) => bytes / (1024 * 1024);

async function reasonOf(bytes: Uint8Array, limits: ReadLimits): Promise<UnreadableReason | "read"> {
  try {
    await spreadsheets.read(bytes, limits);
    return "read";
  } catch (error) {
    if (error instanceof SpreadsheetUnreadableError) return error.reason;
    throw error;
  }
}

/** A sheet of `rows` data rows and `columns` columns, as CSV, through the writer as .xlsx when asked. */
async function sheetOf(kind: "csv" | "xlsx", rows: number, columns: number): Promise<Uint8Array> {
  const header = Array.from({ length: columns }, (_, index) => `Column ${String(index + 1)}`);
  const writer = spreadsheets.writer({
    kind,
    sheetName: "Leads",
    columns: header.map((name) => ({ header: name, kind: "text" as const })),
  });
  writer.write(
    Array.from({ length: rows }, (_, row) => header.map((_, column) => `r${String(row)}c${String(column)}`)),
  );
  return writer.finish();
}

describe("reading within limits", () => {
  it("refuses a zip bomb as too_large_unpacked, inflating no more than 50 MB", async () => {
    const bomb = zipBomb();
    expect(megabytes(bomb.byteLength)).toBeLessThan(1);
    const before = process.memoryUsage();
    expect(await reasonOf(bomb, xlsxLimits)).toBe("too_large_unpacked");
    const after = process.memoryUsage();
    expect(megabytes(after.heapUsed - before.heapUsed)).toBeLessThan(80);
    expect(megabytes(after.arrayBuffers - before.arrayBuffers)).toBeLessThan(80);
  });

  it("refuses a sheet of a million rows as too_many_rows before reading its cells", async () => {
    const workbook = millionRowWorkbook();
    const started = performance.now();
    expect(await reasonOf(workbook, xlsxLimits)).toBe("too_many_rows");
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("refuses a far row or column that would make the reader pad millions of empty cells", async () => {
    const far = workbookOf([
      { name: "Leads", sheetData: rowOf(1, textCell("A1", "Name")) + rowOf(1_048_576, textCell("A1048576", "x")) },
    ]);
    expect(await reasonOf(far, xlsxLimits)).toBe("too_many_rows");
    const wide = workbookOf([{ name: "Leads", sheetData: rowOf(1, textCell("A1", "Name") + textCell("XFD1", "x")) }]);
    expect(await reasonOf(wide, xlsxLimits)).toBe("too_many_columns");
    // An empty styled cell far to the right holds nothing, so it doesn't count.
    const styled = workbookOf([
      {
        name: "Leads",
        sheetData: rowOf(1, textCell("A1", "Name") + `<c r="XFD1" s="0"/>`) + rowOf(2, textCell("A2", "Asha")),
      },
    ]);
    expect(await reasonOf(styled, xlsxLimits)).toBe("read");
  });

  it("takes 10,000 rows and 50 columns, and refuses a 10,001st row and a 51st column", async () => {
    for (const kind of ["csv", "xlsx"] as const) {
      const limits = kind === "csv" ? csvLimits : xlsxLimits;
      const full = await spreadsheets.read(await sheetOf(kind, 10_000, 50), limits);
      expect(full.rows).toHaveLength(10_000);
      expect(full.header).toHaveLength(50);
      expect(full.rows.at(-1)).toEqual({ rowNumber: 10_001, cells: expect.arrayContaining(["r9999c49"]) as unknown });
      expect(await reasonOf(await sheetOf(kind, 10_001, 2), limits)).toBe("too_many_rows");
      expect(await reasonOf(await sheetOf(kind, 2, 51), limits)).toBe("too_many_columns");
    }
  });

  it("cuts a cell to 4,001 characters, so a 10 MB cell costs no more than its file", async () => {
    const long = "x".repeat(10 * 1024 * 1024);
    const sheet = await spreadsheets.read(new TextEncoder().encode(`Name,Note\nAsha,${long}\n`), csvLimits);
    expect(sheet.rows[0]?.cells[1]).toHaveLength(4001);
    const workbook = workbookOf([
      { name: "Leads", sheetData: rowOf(1, textCell("A1", "Name")) + rowOf(2, textCell("A2", "y".repeat(20_000))) },
    ]);
    expect((await spreadsheets.read(workbook, xlsxLimits)).rows[0]?.cells[0]).toHaveLength(4001);
  });

  it("says not_a_spreadsheet, no_column_names and no_rows for files that are those", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%âã\n1 0 obj\n");
    expect(await reasonOf(pdf, xlsxLimits)).toBe("not_a_spreadsheet");
    expect(await reasonOf(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), xlsxLimits)).toBe(
      "not_a_spreadsheet",
    );
    expect(await reasonOf(workbookOf([{ name: "Leads", sheetData: "" }]).subarray(0, 200), xlsxLimits)).toBe(
      "not_a_spreadsheet",
    );
    // A binary file named .csv holds NUL bytes no text file has.
    expect(await reasonOf(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0x14, 0]), csvLimits)).toBe("not_a_spreadsheet");
    expect(await reasonOf(new Uint8Array(0), csvLimits)).toBe("no_column_names");
    expect(await reasonOf(new TextEncoder().encode("\n,,\n\n"), csvLimits)).toBe("no_column_names");
    expect(await reasonOf(workbookOf([{ name: "Leads", sheetData: "" }]), xlsxLimits)).toBe("no_column_names");
    expect(await reasonOf(new TextEncoder().encode("Name,Phone\n,\n"), csvLimits)).toBe("no_rows");
    expect(
      await reasonOf(workbookOf([{ name: "Leads", sheetData: rowOf(1, textCell("A1", "Name")) }]), xlsxLimits),
    ).toBe("no_rows");
  });
});
