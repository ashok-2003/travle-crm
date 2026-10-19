// The sample file the import page offers (spec 3.2, D15): B9's common headers and three made-up rows. It reads with the
// real CSV reader, every column is guessed, and its rows read into enquiries, so a person who fills it in starts well.
import { readFileSync } from "node:fs";
import { importRowLimits } from "@travel-crm/contracts/imports";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { describe, expect, it } from "vitest";
import { readLeadRow, type LeadRowContext } from "../../../src/crm/lead-import/lead-row.js";
import { guessFields } from "../../../src/imports/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const sample = readFileSync(new URL("../../../../../apps/web/public/samples/leads-sample.csv", import.meta.url));

describe("the lead import's sample file", () => {
  it("reads, with every column guessed and three rows that all become enquiries", async () => {
    const sheet = await createSpreadsheets().read(sample, {
      kind: "csv",
      maxRows: importRowLimits.leads,
      maxColumns: 50,
      maxCellLength: 4000,
    });
    expect(sheet.rows).toHaveLength(3);
    const guesses = guessFields("leads", sheet.header, new Map());
    expect(guesses.map((guess) => guess.field)).toEqual([
      "name",
      "phone",
      "email",
      "destination",
      "travel_from",
      "adults",
      "budget",
      "stage",
      "owner",
      "enquiry_date",
      "their_source",
      "note",
    ]);
    const fieldOf = new Map(
      guesses.flatMap((guess, position) => (guess.field === null ? [] : [[position, guess.field] as const])),
    );
    const context: LeadRowContext = {
      columns: {
        fieldOf,
        positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
      },
      headers: sheet.header,
      ownerOf: () => null,
      stageOf: () => null,
      defaults: { stage: "new", ownerUserId: "0199a000-0000-7000-8000-0000000000a1", budgetBasis: "for_everyone" },
      fileName: "leads-sample.csv",
      today: parseCalendarDate("2026-10-19"),
      timeZone: "Asia/Kolkata",
    };
    const readings = sheet.rows.map((row) => readLeadRow(row, context));
    expect(readings.map((reading) => reading.kind)).toEqual(["enquiry", "enquiry", "enquiry"]);
    // Nothing in the sample needs the note's kept values: every date, month and amount reads.
    expect(readings.map((reading) => reading.kind === "enquiry" && reading.noted)).toEqual([false, false, false]);
  });
});
