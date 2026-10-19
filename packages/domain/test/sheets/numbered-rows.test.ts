// The rows of a read, each with its identity: two exact copies are two rows, a blank row is skipped, numbers stay true.
import { describe, expect, it } from "vitest";
import { hex, numberRows } from "../../src/sheets/index.js";

describe("numberRows", () => {
  it("numbers two identical rows 1 and 2, and a lone row 1", () => {
    const rows = numberRows([
      { rowNumber: 2, cells: ["Asha", "1"] },
      { rowNumber: 3, cells: ["Ravi", "2"] },
      { rowNumber: 4, cells: ["Asha", "1"] },
      { rowNumber: 5, cells: ["Asha", "1", ""] },
    ]);
    expect(rows.map((row) => [row.rowNumber, row.occurrence])).toEqual([
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 3],
    ]);
    expect(hex(rows[0]?.hash ?? new Uint8Array())).toBe(hex(rows[2]?.hash ?? new Uint8Array()));
    expect(hex(rows[0]?.hash ?? new Uint8Array())).not.toBe(hex(rows[1]?.hash ?? new Uint8Array()));
  });

  it("skips a row of only blanks and keeps the others' row numbers", () => {
    const rows = numberRows([
      { rowNumber: 2, cells: ["", " "] },
      { rowNumber: 3, cells: ["Asha"] },
      { rowNumber: 4, cells: [] },
      { rowNumber: 5, cells: ["", "x"] },
    ]);
    expect(rows.map((row) => row.rowNumber)).toEqual([3, 5]);
  });
});
