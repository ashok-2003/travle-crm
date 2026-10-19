// @vitest-environment node
// The journeys' files (imports.ts) are files the product reads as a person's: a CSV with a quoted comma and an .xlsx
// with a number cell come back through the real reader as the rows they were made from.
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { describe, expect, it } from "vitest";
import { csvOf, xlsxOf } from "./imports";

const limits = { maxRows: 100, maxColumns: 50, maxCellLength: 4000 };

describe("the journeys' import files", () => {
  it("writes a CSV and an .xlsx the product reads back as their rows", async () => {
    const spreadsheets = createSpreadsheets();
    const csv = await spreadsheets.read(
      csvOf([
        ["Name", "Phone", "Destination"],
        ["Asha Mehta", "98765 43210", "Goa, Kerala"],
      ]),
      { ...limits, kind: "csv" },
    );
    expect(csv.header).toEqual(["Name", "Phone", "Destination"]);
    expect(csv.rows.map((row) => row.cells)).toEqual([["Asha Mehta", "98765 43210", "Goa, Kerala"]]);

    const xlsx = await spreadsheets.read(
      await xlsxOf([
        ["Name", "Adults"],
        ["Ravi Kumar", 2],
        ["Meera Iyer", null],
      ]),
      { ...limits, kind: "xlsx" },
    );
    expect(xlsx.sheetName).toBe("Sheet1");
    expect(xlsx.rows.map((row) => row.cells)).toEqual([
      ["Ravi Kumar", "2"],
      ["Meera Iyer", null],
    ]);
  });
});
