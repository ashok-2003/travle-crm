// "Connect the sheet": once, from the last step with the fields complete, as the confirming member.
import { afterAll, describe, expect, it } from "vitest";
import {
  chooseExistingRows,
  chooseSheetTab,
  confirmSheet,
  matchSheetColumns,
  takeSpreadsheetClaim,
} from "../../src/sheets/index.js";
import { deleteClaim } from "../../src/sheets/schedule.js";
import { aDraftSheet, anAgency, auditOf, createTestSheets, eventsOf, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");

async function readyToConfirm(options: { connector?: "same" | "other"; impersonatedBy?: string | null } = {}) {
  const agency = await anAgency(test);
  const starter = memberOf(agency);
  const made = await aDraftSheet(test, starter, {
    rows: [
      ["Full name", "Phone number"],
      ["Asha", "1"],
    ],
  });
  await chooseSheetTab(test.db, test.dependencies, starter, { sheetId: made.sheetId, tabGid: "0" }, now);
  await test.db.forOrg(agency, async (tx) => {
    await matchSheetColumns(
      tx,
      starter,
      {
        sheetId: made.sheetId,
        columns: [
          { headerKey: "fullname", field: "name" },
          { headerKey: "phonenumber", field: "phone" },
        ],
        values: [],
      },
      { owners: new Set(), now },
    );
  });
  const confirmer = options.connector === "other" ? memberOf(agency, "org-admin") : starter;
  const impersonatedBy = options.impersonatedBy ?? null;
  const acting = {
    ...confirmer,
    impersonatedBy,
    ...(impersonatedBy === null ? {} : { source: "impersonation" as const }),
  };
  return { agency, starter, confirmer: acting, made };
}

describe("confirmSheet", () => {
  it("confirms once: step done, one sheet.connected audit entry, one baseline event", async () => {
    const { agency, confirmer, made } = await readyToConfirm();
    await test.db.forOrg(agency, (tx) => chooseExistingRows(tx, { sheetId: made.sheetId, existingRows: "check" }, now));
    await confirmSheet(test.db, confirmer, made.sheetId, now);
    const sheet = await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: made.sheetId } }),
    );
    expect(sheet).toMatchObject({ step: "done", status: "connecting", existingRows: "check" });
    const entries = await auditOf(test, agency, made.sheetId);
    expect(entries.map((entry) => [entry.action, entry.entityType, entry.after])).toEqual([
      ["sheet.connected", "sheet_connection", { existingRows: "check", columnsMatched: 2 }],
    ]);
    expect(await eventsOf(test, agency, ["sheet.baseline-requested"])).toEqual([
      ["sheet.baseline-requested", { sheetId: made.sheetId }],
    ]);
    // A second press finds the sheet moved on, and does nothing more.
    await expect(confirmSheet(test.db, confirmer, made.sheetId, now)).rejects.toMatchObject({
      reason: "SHEET_NOT_READY",
    });
    expect(await auditOf(test, agency, made.sheetId)).toHaveLength(1);
    expect(await eventsOf(test, agency, ["sheet.baseline-requested"])).toHaveLength(1);
  });

  it("treats a sheet with no choice made (no rows to ask about) as only new rows", async () => {
    const { agency, confirmer, made } = await readyToConfirm();
    await confirmSheet(test.db, confirmer, made.sheetId, now);
    const sheet = await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: made.sheetId } }),
    );
    expect(sheet.existingRows).toBe("only_new");
  });

  it("refuses a sheet whose fields aren't complete, or that isn't at its last step", async () => {
    const agency = await anAgency(test);
    const starter = memberOf(agency);
    const made = await aDraftSheet(test, starter);
    await expect(confirmSheet(test.db, starter, made.sheetId, now)).rejects.toMatchObject({
      reason: "SHEET_NOT_READY",
    });
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: made.sheetId }, data: { step: "existing" } }),
    );
    await expect(confirmSheet(test.db, starter, made.sheetId, now)).rejects.toMatchObject({
      reason: "SHEET_NOT_READY",
    });
    await expect(confirmSheet(test.db, starter, "0199e7a0-0000-7000-8000-0000000000ff", now)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("takes the claim again for a draft whose claim is gone, and refuses when another agency holds the sheet now (M8)", async () => {
    const { agency, confirmer, made } = await readyToConfirm();
    const claimOf = async () =>
      (await test.db.forOrg(agency, (tx) => tx.sheetConnection.findUniqueOrThrow({ where: { id: made.sheetId } })))
        .claimId;
    const gone = await claimOf();
    expect(gone).not.toBeNull();
    await deleteClaim(test.db, agency, gone ?? "");
    await confirmSheet(test.db, confirmer, made.sheetId, now, test.hashes);
    const after = await claimOf();
    expect(after).not.toBeNull();
    expect(after).not.toBe(gone);

    const other = await readyToConfirm();
    const lost = await test.db.forOrg(other.agency, (tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: other.made.sheetId } }),
    );
    await deleteClaim(test.db, other.agency, lost.claimId ?? "");
    const thief = await anAgency(test);
    await takeSpreadsheetClaim(test.db, thief, test.hashes.spreadsheetHash(other.made.spreadsheetId), now);
    await expect(confirmSheet(test.db, other.confirmer, other.made.sheetId, now, test.hashes)).rejects.toMatchObject({
      reason: "SHEET_CLAIMED_ELSEWHERE",
    });
  });

  it("acts as the member who confirmed, with who impersonated them", async () => {
    const support = "0199e7a0-0000-7000-8000-0000000000e1";
    const { agency, confirmer, starter, made } = await readyToConfirm({ connector: "other", impersonatedBy: support });
    await confirmSheet(test.db, confirmer, made.sheetId, now);
    const sheet = await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: made.sheetId } }),
    );
    expect(sheet.connectedBy).toBe(confirmer.userId);
    expect(sheet.connectedBy).not.toBe(starter.userId);
    expect(sheet.impersonatedBy).toBe(support);
  });
});
