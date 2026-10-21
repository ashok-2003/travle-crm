// The in-memory spreadsheets twin: sheets as JSON bytes for the domain's tests, any reason a read may fail with, and
// what each writer wrote.
import { describe, expect, it } from "vitest";
import { createMemorySpreadsheets, SpreadsheetUnreadableError } from "../../src/spreadsheets/index.js";

const limits = { kind: "xlsx", maxRows: 3, maxColumns: 5, maxCellLength: 10 } as const;

describe("memory spreadsheets", () => {
  it("reads a sheet given as JSON bytes, fails with any reason asked for, and keeps what a writer wrote", async () => {
    const spreadsheets = createMemorySpreadsheets();
    const bytes = spreadsheets.bytesOf({
      header: ["Name", "", "Name"],
      rows: [
        ["Asha", null, "x"],
        [null, null, null],
        ["Ravi", "'+91", "y".repeat(20)],
      ],
      sheetName: "Leads Oct",
    });
    expect(await spreadsheets.read(bytes, limits)).toEqual({
      sheetName: "Leads Oct",
      sheetCount: 1,
      header: ["Name", "Column B", "Name (2)"],
      rows: [
        { rowNumber: 2, cells: ["Asha", null, "x"] },
        { rowNumber: 4, cells: ["Ravi", "+91", "y".repeat(11)] },
      ],
    });
    expect((await spreadsheets.read(bytes, { ...limits, kind: "csv" })).sheetName).toBeNull();

    spreadsheets.failNextRead("protected");
    await expect(spreadsheets.read(bytes, limits)).rejects.toEqual(new SpreadsheetUnreadableError("protected"));
    await expect(spreadsheets.read(new TextEncoder().encode("not json"), limits)).rejects.toHaveProperty(
      "reason",
      "not_a_spreadsheet",
    );
    const tooMany = spreadsheets.bytesOf({ header: ["Name"], rows: [["a"], ["b"], ["c"], ["d"]] });
    await expect(spreadsheets.read(tooMany, limits)).rejects.toHaveProperty("reason", "too_many_rows");

    const writer = spreadsheets.writer({
      kind: "csv",
      sheetName: "Report",
      columns: [{ header: "Row", kind: "number" }],
    });
    writer.write([[2], [5]]);
    const written = await writer.finish();
    expect(spreadsheets.written).toEqual([
      { kind: "csv", columns: [{ header: "Row", kind: "number" }], rows: [[2], [5]] },
    ]);
    expect((await spreadsheets.read(written, limits)).rows).toEqual([
      { rowNumber: 2, cells: ["2"] },
      { rowNumber: 3, cells: ["5"] },
    ]);
  });
});
