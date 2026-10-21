// Naming a sheet's columns (B3, D13, and the Sheets sync's S11): a blank header is named by its column's letter, a
// repeated one gains "(2)", and a CSV names them exactly as nameHeaders does, so a Google Sheet's columns and a file's
// read alike.
import { describe, expect, it } from "vitest";
import { columnLetters, createSpreadsheets, nameHeaders } from "../../src/spreadsheets/index.js";

describe("header names", () => {
  it("names a blank by its letter and a repeat with (2), case aside", () => {
    expect(nameHeaders(["Name", "", "Name"])).toEqual(["Name", "Column B", "Name (2)"]);
    expect(nameHeaders(["Phone", "  ", "phone", "PHONE"])).toEqual(["Phone", "Column B", "phone (2)", "PHONE (3)"]);
    expect(nameHeaders([])).toEqual([]);
  });

  it("gives a column its letters as Excel shows them", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetters)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });

  it("names a file's columns as nameHeaders does", async () => {
    const sheet = await createSpreadsheets().read(new TextEncoder().encode("Name,,Name\nAsha,x,y\n"), {
      kind: "csv",
      maxRows: 10,
      maxColumns: 50,
      maxCellLength: 4000,
    });
    expect(sheet.header).toEqual(nameHeaders(["Name", "", "Name"]));
  });
});
