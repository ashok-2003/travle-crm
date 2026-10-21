// The sample file the staff import offers (D15): the real reader reads it, its headers are all guessed, and its three
// example rows are people the check would add.
import { readFileSync } from "node:fs";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { describe, expect, it } from "vitest";
import { guessFields, readStaffRow } from "../../../src/imports/index.js";
import type { ColumnMatches } from "../../../src/imports/index.js";

const sample = readFileSync(new URL("../../../../../apps/web/public/samples/staff-sample.csv", import.meta.url));

describe("the staff sample file", () => {
  it("is read by the reader, every header guessed, and its rows are good staff rows", async () => {
    const sheet = await createSpreadsheets().read(new Uint8Array(sample), {
      kind: "csv",
      maxRows: 500,
      maxColumns: 50,
      maxCellLength: 4000,
    });
    const guesses = guessFields("staff", sheet.header, new Map());
    expect(guesses.map((guess) => guess.field)).toEqual(["name", "username", "email", "phone", "role"]);
    const fieldOf = new Map(
      guesses.flatMap((guess, position) => (guess.field === null ? [] : [[position, guess.field] as const])),
    );
    const columns: ColumnMatches = {
      fieldOf,
      positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
    };
    const readings = sheet.rows.map((row) =>
      readStaffRow(row, {
        columns,
        roleOf: (value) => (value === "Sales" ? "sales" : "operations"),
        defaultRoleKey: null,
      }),
    );
    expect(sheet.rows).toHaveLength(3);
    expect(readings.map((reading) => reading.kind)).toEqual(["ready", "ready", "ready"]);
  });
});
