// The baseline (S14): every row present is recorded as before_connect with its hash and occurrence, the cursor goes after
// the last row, the sheet starts running; with "also check" the newest rows become an ordinary lead import's file.
import { afterAll, describe, expect, it } from "vitest";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { storageKeyOf } from "../../src/files/attachment-row.js";
import {
  baselineListener,
  connectImportMaxRows,
  disconnectSheet,
  hex,
  rowHash,
  uuidFromText,
} from "../../src/sheets/index.js";
import { connectImportCsv } from "../../src/sheets/connect-import-file.js";
import {
  anAgency,
  aConfirmedSheet,
  createTestSheets,
  eventsOf,
  formHeader,
  jobDependencies,
  memberOf,
  runListener,
} from "./support/sheets.js";
import { countingContext } from "../imports/support/test-imports.js";

const test = createTestSheets();
afterAll(() => test.close());

const formRow = (index: number) => [
  `19/10/2026 ${String(index)}`,
  `Person ${String(index)}`,
  `98765 ${String(10000 + index)}`,
  "",
];
const baseline = (organizationId: string, sheetId: string) =>
  runListener(test, baselineListener(jobDependencies(test)), organizationId, {
    type: "sheet.baseline-requested",
    payload: { sheetId },
  });

async function setup(rows: string[][], existingRows: "only_new" | "check" = "only_new") {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const sheet = await aConfirmedSheet(test, importer, { rows, existingRows });
  const stored = () =>
    test.db.forOrg(agency, async (tx) => ({
      sheet: await tx.sheetConnection.findUniqueOrThrow({ where: { id: sheet.sheetId } }),
      rows: await tx.sheetRow.findMany({ where: { connectionId: sheet.sheetId }, orderBy: { rowNumber: "asc" } }),
      imports: await tx.importBatch.findMany({ where: { sourceSheetId: sheet.sheetId } }),
    }));
  return { agency, importer, sheet, stored };
}

describe("the baseline", () => {
  it("records every row present as before_connect, with its hash and occurrence, and puts the cursor after the last row", async () => {
    const rows = [formHeader, ...Array.from({ length: 2500 }, (_, index) => formRow(index))];
    const { agency, sheet, stored } = await setup(rows);
    // 2,500 rows go to the ledger 1,000 to a transaction: the first look, three of rows, the last.
    const { context, counted } = countingContext(test, agency);
    await baselineListener(jobDependencies(test)).handle(
      {
        id: "0199e7a0-0000-7000-8000-0000000000aa",
        organizationId: agency,
        type: "sheet.baseline-requested",
        payload: { sheetId: sheet.sheetId },
        occurredAt: new Date(),
      },
      context,
    );
    // The tab read, one look for erased customers, three chunks of ledger rows, and the last.
    expect(counted.transactions).toBe(6);
    const { sheet: connection, rows: ledger } = await stored();
    expect(ledger).toHaveLength(2500);
    expect(new Set(ledger.map((row) => row.status))).toEqual(new Set(["before_connect"]));
    expect(ledger[0]).toMatchObject({ rowNumber: 2, occurrence: 1 });
    expect(ledger.at(-1)?.rowNumber).toBe(2501);
    expect(connection).toMatchObject({
      status: "running",
      cursorRow: 2501,
      rowsSeen: 2500,
      consecutiveFailures: 0,
    });
    expect(connection.connectedAt).not.toBeNull();
    expect(connection.lastCheckedAt).not.toBeNull();
    expect(connection.lastFullReadAt).not.toBeNull();
    expect(connection.headerHash).not.toBeNull();
  });

  it("records two identical rows as occurrences 1 and 2", async () => {
    const { agency, sheet, stored } = await setup([formHeader, formRow(1), formRow(2), formRow(1)]);
    await baseline(agency, sheet.sheetId);
    const { rows } = await stored();
    const byHash = new Map<string, number[]>();
    for (const row of rows) byHash.set(hex(row.rawHash), [...(byHash.get(hex(row.rawHash)) ?? []), row.occurrence]);
    expect([...byHash.values()].map((occurrences) => occurrences.sort()).sort()).toEqual([[1], [1, 2]]);
  });

  it("starts no import for 'only new rows', and one named by the sheet for 'also check'", async () => {
    const rows = [formHeader, formRow(1), formRow(2)];
    const onlyNew = await setup(rows, "only_new");
    await baseline(onlyNew.agency, onlyNew.sheet.sheetId);
    expect((await onlyNew.stored()).imports).toHaveLength(0);

    const check = await setup(rows, "check");
    await baseline(check.agency, check.sheet.sheetId);
    const { imports } = await check.stored();
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      id: uuidFromText(`sheet-import:${check.sheet.sheetId}`),
      kind: "leads",
      status: "reading",
      startedBy: check.importer.userId,
      sourceSheetId: check.sheet.sheetId,
    });
    expect(imports[0]?.fileName).toMatch(/^Goa Diwali campaign \(Responses\) · \d{1,2} \w{3}\.csv$/);
  });

  it("makes one import however often it is run", async () => {
    const { agency, sheet, stored } = await setup([formHeader, formRow(1)], "check");
    await baseline(agency, sheet.sheetId);
    // A retried run finds the sheet running and does nothing; even a sheet put back would reuse the import.
    await baseline(agency, sheet.sheetId);
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: sheet.sheetId }, data: { status: "connecting" } }),
    );
    await baseline(agency, sheet.sheetId);
    expect((await stored()).imports).toHaveLength(1);
    expect(await eventsOf(test, agency, ["import.uploaded"])).toHaveLength(1);
  });

  it("writes the newest 10,000 rows of a bigger sheet as the import's CSV, in the sheet's header names", async () => {
    const header = ["Name", "Mobile", "Name", ""];
    const rows = Array.from({ length: connectImportMaxRows + 5 }, (_, index) => [
      `P${String(index)}`,
      String(index),
      "",
      "",
    ]);
    const spreadsheets = createSpreadsheets();
    const { bytes, rows: written } = await connectImportCsv(spreadsheets, {
      header,
      rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells })),
    });
    expect(written).toBe(connectImportMaxRows);
    const read = await spreadsheets.read(bytes, { kind: "csv", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 });
    expect(read.header).toEqual(["Name", "Mobile", "Name (2)", "Column D"]);
    expect(read.rows[0]?.cells[0]).toBe("P5");
    expect(read.rows.at(-1)?.cells[0]).toBe(`P${String(connectImportMaxRows + 4)}`);
  });

  it("reads a cell starting with = back as the cell, not a formula", async () => {
    const spreadsheets = createSpreadsheets();
    const { bytes } = await connectImportCsv(spreadsheets, {
      header: ["Name", "Note"],
      rows: [{ rowNumber: 2, cells: ['=HYPERLINK("x")', "+91 98765 43210"] }],
    });
    expect(new TextDecoder().decode(bytes)).toContain("'=HYPERLINK");
    const read = await spreadsheets.read(bytes, { kind: "csv", maxRows: 10, maxColumns: 5, maxCellLength: 100 });
    expect(read.rows[0]?.cells).toEqual(['=HYPERLINK("x")', "+91 98765 43210"]);
  });

  it("handles a header-only sheet: cursor 1, no import offered, running", async () => {
    const { agency, sheet, stored } = await setup([formHeader], "check");
    await baseline(agency, sheet.sheetId);
    const { sheet: connection, rows, imports } = await stored();
    expect(rows).toHaveLength(0);
    expect(imports).toHaveLength(0);
    expect(connection).toMatchObject({ status: "running", cursorRow: 1, rowsSeen: 0 });
  });

  it("moves the sheet to running and publishes sheet.schedule-changed once", async () => {
    const { agency, sheet } = await setup([formHeader, formRow(1)]);
    await baseline(agency, sheet.sheetId);
    await baseline(agency, sheet.sheetId);
    expect(await eventsOf(test, agency, ["sheet.schedule-changed"])).toEqual([
      ["sheet.schedule-changed", { sheetId: sheet.sheetId }],
    ]);
  });

  it("ends a permanent Google answer in lost_access, and fails the job for a busy Google", async () => {
    const lost = await setup([formHeader, formRow(1)]);
    test.google.unshare(lost.sheet.spreadsheetId, test.accountEmail);
    await baseline(lost.agency, lost.sheet.sheetId);
    expect((await lost.stored()).sheet).toMatchObject({ status: "lost_access" });
    expect((await lost.stored()).sheet.attentionSince).not.toBeNull();
    expect(await eventsOf(test, lost.agency, ["sheet.attention"])).toEqual([
      ["sheet.attention", { sheetId: lost.sheet.sheetId, state: "lost_access" }],
    ]);

    const busy = await setup([formHeader, formRow(1)]);
    for (const reason of ["rate_limited", "unavailable", "too_large"] as const) {
      test.google.failNext(reason);
      await expect(baseline(busy.agency, busy.sheet.sheetId), reason).rejects.toMatchObject({ reason });
    }
    expect((await busy.stored()).sheet.status).toBe("connecting");
    // Google answers again: the job's retry carries on.
    await baseline(busy.agency, busy.sheet.sheetId);
    expect((await busy.stored()).sheet.status).toBe("running");
  });

  it("finds a renamed tab by its gid, and does nothing for a sheet no longer at its step", async () => {
    const renamed = await setup([formHeader, formRow(1)]);
    test.google.renameTab(renamed.sheet.spreadsheetId, "0", "Responses");
    await baseline(renamed.agency, renamed.sheet.sheetId);
    expect((await renamed.stored()).sheet).toMatchObject({ status: "running", tabTitle: "Responses" });

    const paused = await setup([formHeader, formRow(1)]);
    await test.db.forOrg(paused.agency, (tx) =>
      tx.sheetConnection.update({ where: { id: paused.sheet.sheetId }, data: { status: "paused" } }),
    );
    const callsBefore = test.google.calls.total;
    await baseline(paused.agency, paused.sheet.sheetId);
    expect(test.google.calls.total).toBe(callsBefore);
    expect((await paused.stored()).rows).toHaveLength(0);
  });

  it("marks a row of an erased customer erased, by contact, keeps no plain hash of it, and leaves it out of the connect-time import", async () => {
    const rows = [formHeader, formRow(1), formRow(2), formRow(3)];
    const { agency, sheet, stored } = await setup(rows, "check");
    await test.db.forOrg(agency, (tx) =>
      tx.sheetErasedContact.create({ data: { contactHash: test.hashes.contactHash("phone", "+919876510002") } }),
    );
    await baseline(agency, sheet.sheetId);
    const { rows: ledger, imports } = await stored();
    expect(ledger.map((row) => row.status)).toEqual(["before_connect", "erased", "before_connect"]);
    expect(Buffer.from(ledger[1]?.rawHash ?? []).equals(Buffer.from(rowHash(formRow(2))))).toBe(false);
    // The import was started from the file without that row.
    expect(imports).toHaveLength(1);
    const attachment = await test.db.forOrg(agency, (tx) =>
      tx.attachment.findFirstOrThrow({ where: { recordId: imports[0]?.id ?? "" }, select: { id: true } }),
    );
    const object = test.storage.objects.get(storageKeyOf({ organizationId: agency, id: attachment.id }));
    const text = new TextDecoder().decode(object?.body);
    expect(text).toContain("Person 1");
    expect(text).not.toContain("Person 2");
    expect(text).toContain("Person 3");
  });

  it("marks a row erased when the same cells were erased on another sheet, and disconnecting keeps erased rows", async () => {
    const rows = [formHeader, formRow(1), formRow(2)];
    const first = await setup(rows);
    await baseline(first.agency, first.sheet.sheetId);
    // The first sheet's row 2 is erased as the erasure leaves it: keyed hashes, status erased.
    await test.db.forOrg(first.agency, async (tx) => {
      const row = await tx.sheetRow.findFirstOrThrow({ where: { connectionId: first.sheet.sheetId, rowNumber: 3 } });
      await tx.sheetRow.update({
        where: { id: row.id },
        data: { status: "erased", rawHash: new Uint8Array(test.hashes.rekey(row.rawHash)) },
      });
    });
    const second = await aConfirmedSheet(test, first.importer, { rows });
    await baseline(first.agency, second.sheetId);
    const ledger = await test.db.forOrg(first.agency, (tx) =>
      tx.sheetRow.findMany({ where: { connectionId: second.sheetId }, orderBy: { rowNumber: "asc" } }),
    );
    expect(ledger.map((row) => row.status)).toEqual(["before_connect", "erased"]);
    // Disconnecting the first sheet drops its ledger but not its erased rows.
    await disconnectSheet(test.db, first.importer, first.sheet.sheetId, new Date());
    const left = await test.db.forOrg(first.agency, (tx) =>
      tx.sheetRow.findMany({ where: { connectionId: first.sheet.sheetId } }),
    );
    expect(left.map((row) => row.status)).toEqual(["erased"]);
  });
});
