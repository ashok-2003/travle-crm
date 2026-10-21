// The connect steps: tab, columns, existing rows. Each at its own step only; a second tab already connected, a field
// twice, a sheet with no Name or contact and an owner who can't work leads are refused; the matched headers are
// remembered for the next sheet and the next file import; a running sheet is matched again with one audit entry that
// holds no header.
import { afterAll, describe, expect, it } from "vitest";
import { rememberedHeaderFields } from "../../src/imports/index.js";
import { DomainError } from "../../src/kernel/index.js";
import { chooseExistingRows, chooseSheetTab, matchSheetColumns, verifySheet } from "../../src/sheets/index.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { aDraftSheet, aSheet, anAgency, auditOf, createTestSheets, formHeader, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");
const asha = "0199e7a0-0000-7000-8000-00000000a5a5";
const owners = new Set([asha]);

const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).reason;
};

async function draft(
  rows: string[][] = [formHeader, ["19/10/2026 14:32:10", "Asha", "98765 43210", "a@x.test", "Goa"]],
) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const made = await aDraftSheet(test, importer, {
    rows,
    more: [
      {
        gid: "9",
        title: "Walk-ins",
        rows: [
          ["Name", "Mobile"],
          ["Ravi", "1"],
        ],
      },
    ],
  });
  const forOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(agency, work);
  const stateOf = () => forOrg((tx) => tx.sheetConnection.findUniqueOrThrow({ where: { id: made.sheetId } }));
  const keyed = (...fields: [string, string | null][]) => ({
    sheetId: made.sheetId,
    columns: fields.map(([headerKey, field]) => ({ headerKey, field: field as never })),
    values: [] as { value: string; target: string | null }[],
  });
  const match = (input: ReturnType<typeof keyed>) =>
    forOrg((tx) => matchSheetColumns(tx, importer, input, { owners, now }));
  return { agency, importer, made, forOrg, stateOf, keyed, match };
}

describe("the connect steps", () => {
  it("moves tab to columns to existing, and refuses a step asked out of turn: SHEET_NOT_READY", async () => {
    const { importer, agency, made, forOrg, stateOf, keyed, match } = await draft();
    expect((await stateOf()).step).toBe("tab");
    // Matching and the existing-rows choice need their own steps first.
    expect(await reasonOf(match(keyed(["fullname", "name"], ["phonenumber", "phone"])))).toBe("SHEET_NOT_READY");
    expect(
      await reasonOf(forOrg((tx) => chooseExistingRows(tx, { sheetId: made.sheetId, existingRows: "check" }, now))),
    ).toBe("SHEET_NOT_READY");

    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "0" }, now);
    expect((await stateOf()).step).toBe("columns");
    await match(keyed(["fullname", "name"], ["phonenumber", "phone"]));
    expect((await stateOf()).step).toBe("existing");
    await forOrg((tx) => chooseExistingRows(tx, { sheetId: made.sheetId, existingRows: "check" }, now));
    expect((await stateOf()).existingRows).toBe("check");
    // Matching can be done again from the last step; choosing a tab after it can't.
    await match(keyed(["fullname", "name"], ["emailaddress", "email"]));
    expect((await stateOf()).step).toBe("existing");
    expect(
      await reasonOf(chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "9" }, now)),
    ).toBe("SHEET_NOT_READY");
    // Another agency's sheet is not found.
    const other = await anAgency(test, "Other agency");
    await expect(
      test.db.forOrg(other, (tx) => chooseExistingRows(tx, { sheetId: made.sheetId, existingRows: "check" }, now)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(agency).not.toBe(other);
  });

  it("chooses another tab, replacing the columns with its headers", async () => {
    const { importer, made, forOrg, stateOf } = await draft();
    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "9" }, now);
    const state = await stateOf();
    expect(state).toMatchObject({ tabGid: "9", tabTitle: "Walk-ins", step: "columns" });
    const columns = await forOrg((tx) => tx.sheetColumn.findMany({ where: { connectionId: made.sheetId } }));
    expect(columns.map((column) => column.header).sort()).toEqual(["Mobile", "Name"]);
    const view = await verifySheet(
      test.db,
      test.dependencies,
      fakeIdentity(),
      importer,
      { sheetId: made.sheetId },
      now,
    );
    expect(view.columns.map((column) => column.field)).toEqual(["name", "phone"]);
  });

  it("refuses a second tab already connected, and a tab the sheet doesn't have", async () => {
    const { agency, importer, made } = await draft();
    const taken = await draft([["Name"], ["x"]]);
    // A running connection of the first sheet's other tab: choosing it from the second draft of the same spreadsheet.
    const spreadsheetId = made.spreadsheetId;
    const second = await test.db.forOrg(agency, (tx) =>
      aSheet(tx, { connectedBy: importer.userId, spreadsheetId, tabGid: "9", tabTitle: "Walk-ins" }),
    );
    expect(second.id).toBeTruthy();
    expect(
      await reasonOf(chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "9" }, now)),
    ).toBe("SHEET_ALREADY_CONNECTED");
    expect(
      await reasonOf(
        chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "404" }, now),
      ),
    ).toBe("SHEET_NOT_READY");
    expect(taken.made.sheetId).not.toBe(made.sheetId);
  });

  it("refuses a field matched twice but Note, a missing name or contact, and an owner who can't work leads", async () => {
    const { importer, made, keyed, match } = await draft();
    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "0" }, now);
    expect(
      await reasonOf(match(keyed(["fullname", "name"], ["wheredoyouwanttogo", "name"], ["phonenumber", "phone"]))),
    ).toBe("FIELD_MATCHED_TWICE");
    expect(await reasonOf(match(keyed(["fullname", "name"])))).toBe("IMPORT_NEEDS_NAME_AND_CONTACT");
    expect(await reasonOf(match(keyed(["phonenumber", "phone"], ["emailaddress", "email"])))).toBe(
      "IMPORT_NEEDS_NAME_AND_CONTACT",
    );
    expect(
      await reasonOf(
        match({
          ...keyed(["fullname", "name"], ["phonenumber", "phone"]),
          values: [{ value: "Zed", target: "0199e7a0-0000-7000-8000-00000000dead" }],
        }),
      ),
    ).toBe("NOT_A_LEAD_WORKER");
    // Several columns to Note are fine, and so is a column that isn't in the sheet's header refused as moved on.
    await expect(
      match(
        keyed(["fullname", "name"], ["phonenumber", "phone"], ["timestamp", "note"], ["wheredoyouwanttogo", "note"]),
      ),
    ).resolves.toBeUndefined();
    expect(await reasonOf(match(keyed(["notacolumn", "name"], ["phonenumber", "phone"])))).toBe("SHEET_NOT_READY");
  });

  it("remembers the matched headers for the next sheet and the next file import", async () => {
    const { agency, importer, made, keyed, match, forOrg } = await draft([
      ["Guest", "Cell", "Remark"],
      ["Asha", "1", "x"],
    ]);
    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "0" }, now);
    await match(keyed(["guest", "name"], ["cell", "phone"], ["remark", null]));
    const remembered = await forOrg((tx) => rememberedHeaderFields(tx, "leads"));
    expect(remembered.get("guest")).toBe("name");
    expect(remembered.get("cell")).toBe("phone");
    expect(remembered.get("remark")).toBeNull();
    expect(agency).toBeTruthy();
  });

  it("keeps an owner value the person matched by hand, and changes it when matched again", async () => {
    const { importer, made, keyed, match, forOrg } = await draft([
      ["Name", "Phone", "Handled by"],
      ["Asha", "1", "Ashu"],
    ]);
    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "0" }, now);
    const columns = keyed(["name", "name"], ["phone", "phone"], ["handledby", "owner"]);
    await match({ ...columns, values: [{ value: "Ashu", target: asha }] });
    await match({ ...columns, values: [{ value: "Ashu", target: null }] });
    const matches = await forOrg((tx) => tx.sheetValueMatch.findMany({ where: { connectionId: made.sheetId } }));
    expect(matches).toMatchObject([{ field: "owner", value: "Ashu", target: null, matchedBy: "chosen" }]);
  });

  it("matches again on a running sheet, recording sheet.columns-changed without a header", async () => {
    const { agency, importer, made, forOrg, keyed, match, stateOf } = await draft();
    await chooseSheetTab(test.db, test.dependencies, importer, { sheetId: made.sheetId, tabGid: "0" }, now);
    await match(keyed(["fullname", "name"], ["phonenumber", "phone"]));
    await forOrg((tx) =>
      tx.sheetConnection.update({ where: { id: made.sheetId }, data: { status: "running", step: "done" } }),
    );
    await match(keyed(["fullname", "name"], ["phonenumber", "phone"], ["emailaddress", "email"]));
    expect((await stateOf()).status).toBe("running");
    const entries = await auditOf(test, agency, made.sheetId);
    expect(entries.map((entry) => entry.action)).toEqual(["sheet.columns-changed"]);
    expect(entries[0]?.after).toEqual({ columnsMatched: 3 });
    expect(JSON.stringify(entries)).not.toContain("Full name");
  });
});
