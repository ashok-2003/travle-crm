// S23 case by case: erased, blocked, the same as a row added anywhere, then saved; an unfinished row waits one check; rows
// in one check meet each other.
import { describe, expect, it } from "vitest";
import { readLeadRow } from "../../../src/crm/lead-import/lead-row.js";
import { planSheetRows, type SheetPlanInput } from "../../../src/crm/lead-sheets/index.js";
import { nameColumns } from "../../../src/sheets/header-keys.js";
import { fingerprintHex, rowFingerprint } from "../../../src/imports/index.js";
import { matchHeader } from "../../../src/sheets/header-match.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { formHeader, goaOrigin, readFormRow } from "./support.js";

const answer = (name: string, phone: string, extra: Partial<Record<number, string>> = {}) =>
  ["19/10/2026 14:32:10", name, phone, "", "Goa", "", "", "", "", ...[]].map((cell, index) => extra[index] ?? cell);

function input(cells: string[], options: Partial<Omit<SheetPlanInput, "row" | "reading">> = {}): SheetPlanInput {
  const { reading, row } = readFormRow(cells);
  return {
    row,
    reading,
    ledger: undefined,
    mode: "scheduled",
    isErased: () => false,
    isBlocked: () => false,
    earlier: new Map(),
    baseline: new Set(),
    ...options,
  };
}
const planOne = (item: SheetPlanInput) => planSheetRows([item])[0];

describe("planSheetRows", () => {
  it("leaves a row of an erased customer out as 'erased', showing no name", () => {
    expect(planOne(input(answer("Asha Sharma", "98765 43210"), { isErased: () => true }))).toEqual({
      kind: "not_added",
      reasons: ["erased"],
      exampleName: null,
      exampleValue: null,
    });
  });

  it("leaves a blocked contact out as 'blocked', and adds it at the next read once unblocked", () => {
    const cells = answer("Asha Sharma", "98765 43210");
    expect(planOne(input(cells, { isBlocked: () => true }))).toMatchObject({
      kind: "not_added",
      reasons: ["blocked"],
      exampleName: "Asha Sharma",
    });
    const later = input(cells, {
      mode: "sync-now",
      ledger: { id: "row-1", status: "not_added", rowNumber: 2 },
      isBlocked: () => false,
    });
    expect(planOne(later)).toMatchObject({ kind: "save" });
  });

  it("leaves out a row whose fingerprint was added by another sheet, a file import or earlier in this check, as a duplicate", () => {
    const cells = answer("Asha Sharma", "98765 43210");
    const { reading } = readFormRow(cells);
    if (reading.kind !== "enquiry") throw new Error("Expected an enquiry");
    const fingerprint = fingerprintHex(rowFingerprint("leads", reading.fingerprintValues));
    expect(planOne(input(cells, { earlier: new Map([[fingerprint, new Date()]]) }))).toMatchObject({
      kind: "duplicate",
    });
    // Two rows of one check: the first is saved, the identical second is a duplicate.
    const decisions = planSheetRows([input(cells), { ...input(cells), row: { ...input(cells).row, rowNumber: 3 } }]);
    expect(decisions.map((decision) => decision.kind)).toEqual(["save", "duplicate"]);
  });

  it("saves a row for a person with an open lead, to become a repeat enquiry, and one with only closed leads, to become Returning", () => {
    // The plan says save either way: the save path matches the person and decides.
    const decision = planOne(input(answer("Asha Sharma", "98765 43210")));
    expect(decision).toMatchObject({ kind: "save" });
    if (decision?.kind === "save") {
      expect(decision.fingerprint).toHaveLength(32);
      expect(decision.reading.contacts.phone).toBe("+919876543210");
    }
  });

  it("makes the same fingerprint equal for a sheet row and the same row in a file", () => {
    const header = formHeader;
    const cells = answer("Asha Sharma", "98765 43210", { 7: "Ashu" });
    const sheet = readFormRow(cells, { owners: { Ashu: "user-asha" } }).reading;
    const columns = nameColumns(header).map(({ header: name, key }, index) => ({
      headerKey: key,
      header: name,
      field: ["enquiry_date", "name", "phone", "email", "destination", "note", "note", "owner", "their_source"][
        index
      ] as never,
      isNew: false,
    }));
    const file = readLeadRow(
      { rowNumber: 2, cells },
      {
        columns: matchHeader(header, columns).matches,
        headers: header,
        ownerOf: (value) => (value === "Ashu" ? "user-asha" : null),
        stageOf: () => null,
        defaults: { stage: "new", ownerUserId: "owner-1", budgetBasis: "for_everyone" },
        fileName: "enquiries.csv",
        today: parseCalendarDate("2026-10-20"),
        timeZone: "Asia/Kolkata",
      },
    );
    if (sheet.kind !== "enquiry" || file.kind !== "enquiry") throw new Error("Expected enquiries");
    expect(fingerprintHex(rowFingerprint("leads", sheet.fingerprintValues))).toBe(
      fingerprintHex(rowFingerprint("leads", file.fingerprintValues)),
    );
    // The sheet's identity is not in it: another origin gives the same fingerprint.
    const other = readFormRow(cells, {
      owners: { Ashu: "user-asha" },
      origin: { ...goaOrigin, detail: "Another sheet · Tab" },
    });
    if (other.reading.kind !== "enquiry") throw new Error("Expected an enquiry");
    expect(other.reading.fingerprintValues).toEqual(sheet.fingerprintValues);
  });

  it("holds a row without a name or contact one check, then lists it with its reason; at once for Sync now", () => {
    const cells = answer("Asha Sharma", "");
    expect(planOne(input(cells))).toEqual({ kind: "pending" });
    expect(planOne(input(cells, { ledger: { id: "r", status: "pending", rowNumber: 2 } }))).toMatchObject({
      kind: "not_added",
      reasons: ["no_contact"],
      exampleName: "Asha Sharma",
    });
    for (const mode of ["sync-now", "recheck"] as const) {
      expect(planOne(input(cells, { mode }))).toMatchObject({ kind: "not_added", reasons: ["no_contact"] });
    }
    expect(planOne(input(answer("", "98765 43210")))).toEqual({ kind: "pending" });
    // A row that was listed before and is read again keeps its place in the list while it is unfinished.
    expect(planOne(input(cells, { ledger: { id: "r", status: "not_added", rowNumber: 2 } }))).toEqual({
      kind: "pending",
    });
  });

  it("lists a row with notes over 4,000 characters at once", () => {
    const decision = planOne(input(answer("Asha Sharma", "98765 43210", { 6: "x".repeat(4_100) })));
    expect(decision).toMatchObject({ kind: "not_added", reasons: ["notes_too_long"] });
  });

  it("meets rows of one check against each other: the later row of a person is saved after the earlier", () => {
    const decisions = planSheetRows([
      input(answer("Asha Sharma", "98765 43210")),
      input(answer("Asha Sharma", "98765 43210", { 4: "Kerala" })),
    ]);
    expect(decisions.map((decision) => decision.kind)).toEqual(["save", "save"]);
  });

  it("knows a row that holds what a row there at connect held, before erased, blocked or earlier rows, and counts it nowhere", () => {
    const cells = answer("Asha Sharma", "98765 43210");
    const { reading } = readFormRow(cells);
    if (reading.kind !== "enquiry") throw new Error("not an enquiry");
    const fingerprint = rowFingerprint("leads", reading.fingerprintValues);
    const baseline = new Set([fingerprintHex(fingerprint)]);
    const decision = planOne(
      input(cells, {
        baseline,
        isErased: () => true,
        isBlocked: () => true,
        earlier: new Map([[fingerprintHex(fingerprint), new Date()]]),
      }),
    );
    expect(decision).toEqual({ kind: "known", fingerprint });
    // Another person's row is not known.
    expect(planOne(input(answer("Ravi Kumar", "98100 00000"), { baseline }))?.kind).toBe("save");
  });
});
