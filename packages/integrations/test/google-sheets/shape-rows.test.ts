// shapeRows: what Google hands back that a file never does (Review Focus 2).
import { describe, expect, it } from "vitest";
import { shapeRows } from "@travel-crm/integrations/google-sheets";

const limits = { maxColumns: 50, maxCellLength: 4_000 };

describe("shapeRows", () => {
  it("pads short rows to the header's width and keeps a phone's leading zero as shown", () => {
    const shaped = shapeRows(
      [
        ["Name", "Phone", "City"],
        ["Asha", "098765 43210"],
      ],
      limits,
    );
    expect(shaped[1]).toEqual(["Asha", "098765 43210", ""]);
  });

  it("cuts cells at maxCellLength and drops columns past maxColumns", () => {
    const shaped = shapeRows(
      [
        ["A", "B", "C"],
        ["abcdef", "x", "y"],
      ],
      { maxColumns: 2, maxCellLength: 3 },
    );
    expect(shaped).toEqual([
      ["A", "B"],
      ["abc", "x"],
    ]);
  });

  it("treats a Sheets error value as empty, only when it is the whole cell", () => {
    const shaped = shapeRows(
      [
        ["A", "B", "C"],
        ["#REF!", "#REF! in B3", "#N/A"],
      ],
      limits,
    );
    expect(shaped[1]).toEqual(["", "#REF! in B3", ""]);
  });

  it("pads short rows, cuts cells and treats a Sheets error value as empty", () => {
    const shaped = shapeRows(
      [
        ["Name", "Phone", "Email", "Note"],
        ["Asha", "#VALUE!"],
        ["Ravi", "098765 43210", "#NAME?", "x".repeat(5_000)],
      ],
      limits,
    );
    expect(shaped[1]).toEqual(["Asha", "", "", ""]);
    expect(shaped[2]?.[1]).toBe("098765 43210");
    expect(shaped[2]?.[2]).toBe("");
    expect(shaped[2]?.[3]).toHaveLength(4_000);
  });
});
