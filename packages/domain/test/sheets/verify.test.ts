// Describing a tab for the connect steps: Google Forms' headers guessed, the agency's last match first, the Owner column's
// values with a person for each, and nothing of the sheet's content kept.
import { afterAll, describe, expect, it } from "vitest";
import { rememberHeaderFields } from "../../src/imports/index.js";
import { verifySheet } from "../../src/sheets/index.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { aDraftSheet, anAgency, createTestSheets, formHeader, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");

async function setup(rows: string[][], workers: Record<string, string> = {}) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const draft = await aDraftSheet(test, importer, { rows });
  const verify = (valuesOf?: string) =>
    verifySheet(
      test.db,
      test.dependencies,
      fakeIdentity({ workers }),
      importer,
      { sheetId: draft.sheetId, ...(valuesOf === undefined ? {} : { valuesOf }) },
      now,
    );
  return { agency, importer, draft, verify };
}

describe("verifySheet", () => {
  it("guesses a Google Form's columns: Timestamp is the enquiry date, Email Address the email, Full name the name", async () => {
    const { verify } = await setup([
      formHeader,
      ["19/10/2026 14:32:10", "Asha Sharma", "98765 43210", "asha@example.test", "Goa"],
      ["19/10/2026 15:01:00", "Ravi Kumar", "98765 11111", "", "Kerala"],
    ]);
    const view = await verify();
    expect(view).toMatchObject({ sheetTitle: "Goa Diwali campaign (Responses)", tabGid: "0", rowCount: 2 });
    expect(view.tabs).toEqual([{ gid: "0", title: "Form responses 1" }]);
    expect(view.columns.map((column) => [column.header, column.field, column.guessedBy])).toEqual([
      ["Timestamp", "enquiry_date", "common-name"],
      ["Full name", "name", "common-name"],
      ["Phone number", "phone", "common-name"],
      ["Email Address", "email", "common-name"],
      ["Where do you want to go?", null, null],
    ]);
    expect(view.columns[1]?.samples).toEqual(["Asha Sharma", "Ravi Kumar"]);
    expect(view.columns[3]?.samples).toEqual(["asha@example.test"]);
    expect(view.ownerValues).toBeNull();
  });

  it("guesses a word in a header, and keeps at most three samples a column", async () => {
    const { verify } = await setup([
      ["Your name", "Whatsapp no.", "Which place?", "No of persons"],
      ["Asha", "1", "Goa", "2"],
      ["Ravi", "2", "Goa", "3"],
      ["Meena", "3", "Goa", "4"],
      ["Kiran", "4", "Goa", "5"],
    ]);
    const view = await verify();
    expect(view.columns.map((column) => column.field)).toEqual(["name", "phone", "destination", "adults"]);
    expect(view.columns[0]?.samples).toEqual(["Asha", "Ravi", "Meena"]);
  });

  it("fills the agency's last match for a header first, as last time", async () => {
    const { agency, verify } = await setup([
      ["Contact person", "Mobile", "Notes from call"],
      ["Asha", "1", "x"],
    ]);
    await test.db.forOrg(agency, (tx) =>
      rememberHeaderFields(
        tx,
        "leads",
        [
          { header: "Contact person", field: "name" },
          { header: "Notes from call", field: "note" },
        ],
        now,
      ),
    );
    const view = await verify();
    expect(view.columns.map((column) => [column.field, column.guessedBy])).toEqual([
      ["name", "last-time"],
      ["phone", "common-name"],
      ["note", "last-time"],
    ]);
  });

  it("never offers Stage, whatever the agency matched a header to before", async () => {
    const { agency, verify } = await setup([
      ["Name", "Status"],
      ["Asha", "Booked"],
    ]);
    await test.db.forOrg(agency, (tx) =>
      rememberHeaderFields(tx, "leads", [{ header: "Status", field: "stage" }], now),
    );
    expect((await verify()).columns.map((column) => column.field)).toEqual(["name", null]);
  });

  it("lists the owner column's values with their rows and an automatic match for each", async () => {
    const ashaId = "0199e7a0-0000-7000-8000-00000000a5a5";
    const { verify } = await setup(
      [
        ["Name", "Phone", "Handled by"],
        ["A", "1", "Asha"],
        ["B", "2", "asha"],
        ["C", "3", "Ravi"],
        ["D", "4", "Asha"],
        ["E", "5", ""],
      ],
      { asha: ashaId },
    );
    const view = await verify("handledby");
    expect(view.ownerValues).toEqual([
      { value: "Asha", rows: 2, target: ashaId, matchedBy: "name" },
      { value: "asha", rows: 1, target: ashaId, matchedBy: "name" },
      { value: "Ravi", rows: 1, target: null, matchedBy: "none" },
    ]);
  });

  it("keeps no sample or cell in the database", async () => {
    const { agency, draft, verify } = await setup([
      ["Name", "Phone"],
      ["Priya Unmistakable", "98765 00000"],
    ]);
    await verify();
    const stored = await test.db.forOrg(agency, async (tx) =>
      JSON.stringify([
        await tx.sheetConnection.findMany({ where: { id: draft.sheetId } }),
        await tx.sheetColumn.findMany({ where: { connectionId: draft.sheetId } }),
        await tx.sheetRow.findMany({ where: { connectionId: draft.sheetId } }),
      ]),
    );
    expect(stored).not.toContain("Unmistakable");
    expect(stored).not.toContain("98765 00000");
  });

  it("answers a tab that has gone as a sheet that moved on, and a busy Google as unavailable", async () => {
    const { draft, importer, verify } = await setup([
      ["Name", "Phone"],
      ["Asha", "1"],
    ]);
    test.google.failNext("unavailable");
    await expect(verify()).rejects.toMatchObject({ reason: "SHEETS_UNAVAILABLE" });
    test.google.renameTab(draft.spreadsheetId, "0", "Renamed");
    // The gid is the tab's name: a renamed tab is still found.
    await expect(verify()).resolves.toMatchObject({ tabs: [{ gid: "0", title: "Renamed" }] });
    test.google.deleteSpreadsheet(draft.spreadsheetId);
    await expect(verify()).rejects.toMatchObject({ reason: "SHEET_NOT_SHARED" });
    expect(importer.userId).toBeTruthy();
  });

  it("lists the tabs there are now for a sheet whose tab has gone, with no columns", async () => {
    const { agency, draft, verify } = await setup([
      ["Name", "Phone"],
      ["Asha", "1"],
    ]);
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: draft.sheetId }, data: { status: "tab_missing" } }),
    );
    await expect(verify()).resolves.toMatchObject({
      tabs: [{ gid: "0", title: "Form responses 1" }],
      tabGid: "",
      rowCount: 0,
      columns: [],
      ownerValues: null,
    });
  });

  it("reads only the header and a few rows, and one column for the number of rows and one for the Owner values, never the tab", async () => {
    const rows = [
      ["Name", "Phone", "Handled by"],
      ...Array.from({ length: 300 }, (_, index) => [
        `Person ${String(index)}`,
        `98765${String(10000 + index)}`,
        index % 2 === 0 ? "Asha" : "Neha",
      ]),
    ];
    const { verify } = await setup(rows, { asha: "0199a000-0000-7000-8000-000000000001" });
    const before = { ...test.google.calls };
    const view = await verify();
    expect(view.rowCount).toBe(300);
    // One describe (its rows are the samples), one read of the first column, and one of the Owner column that
    // "Handled by" was guessed to be: single columns, not the tab.
    expect(test.google.calls.reads - before.reads).toBe(2);
    const withOwner = await verify("handledby");
    expect(withOwner.ownerValues?.map(({ value, rows: count }) => [value, count])).toEqual([
      ["Asha", 150],
      ["Neha", 150],
    ]);
    expect(test.google.calls.reads - before.reads).toBe(4);
    expect(view.columns[0]?.samples).toEqual(["Person 0", "Person 1", "Person 2"]);
  });
});
