// Matched columns are found by their header (S11, S15): an inserted column changes nothing, a repeated or blank header is
// named as the reader names it, and only a gap that leaves no name or no contact stops the check.
import { describe, expect, it } from "vitest";
import { matchHeader, stopsTheCheck, type SheetColumnRow } from "../../src/sheets/header-match.js";

const column = (
  header: string,
  field: SheetColumnRow["field"],
  headerKey = header.toLowerCase().replaceAll(/\W/g, ""),
) => ({
  headerKey,
  header,
  field,
  isNew: false,
});
const columns = [
  column("Full name", "name"),
  column("Mobile No", "phone"),
  column("Email", "email"),
  column("Budget", "budget"),
  column("Remarks", null),
];

describe("matchHeader", () => {
  it("finds a matched column by its header after one is inserted before it", () => {
    const before = matchHeader(["Full name", "Mobile No", "Email", "Budget", "Remarks"], columns);
    expect(before.matches.fieldOf.get(1)).toBe("phone");
    const after = matchHeader(["Timestamp", "Full name", "Mobile No", "Email", "Budget", "Remarks"], columns);
    expect(after.matches.fieldOf.get(2)).toBe("phone");
    expect(after.matches.positionsOf("name")).toEqual([1]);
    expect(after.missing).toEqual([]);
    expect(after.unseen).toEqual([{ header: "Timestamp", headerKey: "timestamp" }]);
    expect(after.positionOf.get("email")).toBe(3);
    expect(stopsTheCheck(after, columns)).toBeNull();
  });

  it("names a repeated header (2) and a blank one by its letter, as the reader does", () => {
    const sheetColumns = [
      column("Name", "name", "name"),
      column("Name (2)", null, "name2"),
      column("Column C", "phone", "columnc"),
    ];
    const match = matchHeader(["Name", "name", ""], sheetColumns);
    expect(match.matches.fieldOf.get(0)).toBe("name");
    expect(match.matches.fieldOf.get(2)).toBe("phone");
    expect(match.unseen).toEqual([]);
  });

  it("lists a header with no column row as unseen", () => {
    const match = matchHeader(["Full name", "Mobile No", "Email", "Budget for the trip"], columns);
    expect(match.unseen.map((header) => header.header)).toEqual(["Budget for the trip"]);
    expect(match.missing.map((gone) => gone.header)).toEqual(["Budget"]);
  });
});

describe("stopsTheCheck", () => {
  it("stops the check only when a missing column leaves no name or no contact", () => {
    // Budget gone: nothing needed is lost.
    expect(stopsTheCheck(matchHeader(["Full name", "Mobile No", "Email", "Remarks"], columns), columns)).toBeNull();
    // Email gone, a phone remains.
    expect(stopsTheCheck(matchHeader(["Full name", "Mobile No", "Budget"], columns), columns)).toBeNull();
    // Mobile No and Email gone: no contact is left; both are named.
    expect(stopsTheCheck(matchHeader(["Full name", "Budget"], columns), columns)).toEqual({
      columns: ["Mobile No", "Email"],
    });
    // The name gone.
    expect(stopsTheCheck(matchHeader(["Mobile No", "Email", "Budget"], columns), columns)).toEqual({
      columns: ["Full name"],
    });
  });
});
