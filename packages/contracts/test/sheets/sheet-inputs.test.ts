// The sheet screens' inputs: unknown keys refused, ids only, the fields without stage, and an owner value's target a user
// id or null.
import { describe, expect, it } from "vitest";
import { leadImportFields } from "../../src/crm/index.js";
import {
  beginSheetInput,
  chooseExistingInput,
  chooseSheetTabInput,
  hideProblemInput,
  matchSheetColumnsInput,
  recheckSheetInput,
  sheetFields,
  sheetIdInput,
  sheetProblemsInput,
  verifySheetInput,
} from "../../src/sheets/index.js";

const sheetId = "0199e7a0-0000-7000-8000-0000000000a1";
const userId = "0199e7a0-0000-7000-8000-0000000000a2";
const link = `https://docs.google.com/spreadsheets/d/${"a".repeat(30)}/edit`;

describe("sheet inputs", () => {
  it("refuses unknown keys in every sheet input", () => {
    const inputs = [
      [sheetIdInput, { sheetId }],
      [beginSheetInput, { link }],
      [verifySheetInput, { sheetId }],
      [chooseSheetTabInput, { sheetId, tabGid: "0" }],
      [matchSheetColumnsInput, { sheetId, columns: [], values: [] }],
      [chooseExistingInput, { sheetId, existingRows: "only_new" }],
      [recheckSheetInput, { sheetId }],
      [hideProblemInput, { sheetId, rowId: sheetId }],
      [sheetProblemsInput, { sheetId }],
    ] as const;
    for (const [schema, input] of inputs) {
      expect(schema.safeParse(input).success).toBe(true);
      expect(schema.safeParse({ ...input, extra: 1 }).success).toBe(false);
    }
  });

  it("lists the 22 sheet fields: the lead import's, without stage", () => {
    expect(sheetFields).toHaveLength(22);
    expect(sheetFields).not.toContain("stage");
    expect(sheetFields).toEqual(leadImportFields.filter((field) => field !== "stage"));
    expect(
      matchSheetColumnsInput.safeParse({ sheetId, columns: [{ headerKey: "stage", field: "stage" }], values: [] })
        .success,
    ).toBe(false);
  });

  it("holds an owner value's target to a user id or null", () => {
    const match = (target: unknown) =>
      matchSheetColumnsInput.safeParse({ sheetId, columns: [], values: [{ value: "Asha", target }] }).success;
    expect(match(userId)).toBe(true);
    expect(match(null)).toBe(true);
    expect(match("Asha")).toBe(false);
    expect(match(undefined)).toBe(false);
  });

  it("bounds the columns, the values and a page", () => {
    const column = { headerKey: "name", field: "name" };
    expect(
      matchSheetColumnsInput.safeParse({ sheetId, columns: Array.from({ length: 51 }, () => column), values: [] })
        .success,
    ).toBe(false);
    expect(
      matchSheetColumnsInput.safeParse({
        sheetId,
        columns: [],
        values: Array.from({ length: 5001 }, () => ({ value: "x", target: null })),
      }).success,
    ).toBe(false);
    expect(sheetProblemsInput.parse({ sheetId }).limit).toBe(50);
    expect(sheetProblemsInput.safeParse({ sheetId, limit: 101 }).success).toBe(false);
    expect(sheetProblemsInput.safeParse({ sheetId, limit: 0 }).success).toBe(false);
  });
});
