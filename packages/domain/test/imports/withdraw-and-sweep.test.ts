// Keeping and deleting an import's files (spec B53, B55, D7, D31, D32): a week after its last change the console's
// sweep deletes its file and report for good and empties what it keeps of the rows, keeping its counts; a file stored
// late under an expired import goes too; an erasure withdraws every import file of the organization at once, and the
// erased person's rows lose their ids and fingerprints.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { sweepExpiredImports, withdrawImportFiles } from "../../src/imports/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { aRow } from "./support/batches.js";
import {
  anAgency,
  anImportWithFile,
  bytes,
  createTestImports,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const personId = "0199e7a0-0000-7000-8000-00000000b0b1";
const leadId = "0199e7a0-0000-7000-8000-00000000b0b2";

describe("keeping and deleting an import's files", () => {
  let test: TestImports;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestImports();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** A finished import holding everything an import keeps: its file and report, columns, values and rows. */
  async function aKeptImport(organizationId: string, keepUntil: Date, status = "done") {
    const importer = memberOf(organizationId);
    const file = test.spreadsheets.bytesOf({ header: ["Name", "Owner"], rows: [["Asha Mehta", "Ravi"]] });
    const { id, attachmentId } = await anImportWithFile(test, importer, file, { status, keepUntil, rowsAdded: 1 });
    const report = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "import_report",
      recordId: id,
      attachmentId: id,
      fileName: "enquiries - rows not added.csv",
      contentType: "text/csv",
      body: bytes("Why it wasn't added"),
    });
    await test.db.forOrg(organizationId, async (tx) => {
      await tx.importBatch.update({ where: { id }, data: { reportAttachmentId: report.id } });
      await tx.importColumn.create({
        data: {
          batchId: id,
          position: 0,
          header: "Name",
          samples: ["Asha Mehta"],
          distinctValues: ["Asha Mehta"],
          distinctCounts: [1],
        },
      });
      await tx.importValueMatch.create({ data: { batchId: id, field: "owner", value: "Ravi", matchedBy: "none" } });
      const fingerprint = new Uint8Array(32).fill(3);
      await aRow(tx, {
        batchId: id,
        rowNumber: 2,
        outcome: "added",
        personId,
        leadId,
        fingerprint,
        exampleName: "Asha Mehta",
      });
      await aRow(tx, {
        batchId: id,
        rowNumber: 3,
        outcome: "added",
        personId: memberOf(organizationId).userId,
        fingerprint,
      });
      await aRow(tx, { batchId: id, rowNumber: 4, plan: "not_added", exampleName: "Ravi", exampleValue: "98765" });
    });
    return { id, files: [attachmentId, report.id] };
  }

  const keptOf = (organizationId: string, id: string) =>
    test.db.forOrg(organizationId, async (tx) => ({
      batch: await tx.importBatch.findUniqueOrThrow({ where: { id } }),
      columns: await tx.importColumn.findMany({ where: { batchId: id } }),
      valueMatches: await tx.importValueMatch.count({ where: { batchId: id } }),
      rows: await tx.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" } }),
    }));
  const attachmentsOf = (id: string) => test.platform.attachment.count({ where: { recordId: id } });
  const queuedFor = (attachmentIds: string[]) =>
    test.platform.storedFileDeletion.count({ where: { attachmentId: { in: attachmentIds } } });

  it("sweeps an import a week after its last change: its file and report deleted for good, its kept values emptied, its counts kept", async () => {
    const organizationId = await anAgency(test, "Swept imports");
    const now = new Date();
    const old = await aKeptImport(organizationId, new Date(now.getTime() - 1000));
    const recent = await aKeptImport(organizationId, new Date(now.getTime() + DAY_MS));
    const swept = await platformDb.transaction((tx) => sweepExpiredImports(tx, now, 100));
    expect(swept.organizationIds).toContain(organizationId);
    expect(await attachmentsOf(old.id)).toBe(0);
    expect(await queuedFor(old.files)).toBe(2);
    const kept = await keptOf(organizationId, old.id);
    expect(kept.batch).toMatchObject({
      status: "expired",
      fileAttachmentId: null,
      reportAttachmentId: null,
      rowsAdded: 1,
      fileName: "enquiries-oct-2026.csv",
    });
    expect(
      kept.columns.map((column) => [column.header, column.samples, column.distinctValues, column.distinctCounts]),
    ).toEqual([["Name", [], [], []]]);
    expect(kept.valueMatches).toBe(0);
    expect(kept.rows.map((row) => [row.outcome, row.exampleName, row.exampleValue, row.fingerprint !== null])).toEqual([
      ["added", null, null, true],
      ["added", null, null, true],
      [null, null, null, false],
    ]);
    // The one still within its week is left alone.
    expect(await attachmentsOf(recent.id)).toBe(2);
    expect((await keptOf(organizationId, recent.id)).batch.status).toBe("done");
  });

  it("deletes a file stored late under an import already expired", async () => {
    const organizationId = await anAgency(test, "Late report");
    const { id } = await aKeptImport(organizationId, new Date(Date.now() + DAY_MS), "expired");
    expect(await attachmentsOf(id)).toBe(2);
    await platformDb.transaction((tx) => sweepExpiredImports(tx, new Date(), 100));
    expect(await attachmentsOf(id)).toBe(0);
  });

  it("withdraws every import file of the organization in an erasure, and empties the person's rows' ids and fingerprints", async () => {
    const organizationId = await anAgency(test, "Erased customer");
    const now = new Date();
    const done = await aKeptImport(organizationId, new Date(now.getTime() + DAY_MS));
    const waiting = await aKeptImport(organizationId, new Date(now.getTime() + DAY_MS), "matching");
    await test.db.forOrg(organizationId, (tx) =>
      aRow(tx, { batchId: waiting.id, rowNumber: 9, plan: "new", passwordHash: "hash" }),
    );
    const elsewhere = await anAgency(test, "Not erased");
    const untouched = await aKeptImport(elsewhere, new Date(now.getTime() + DAY_MS));
    const withdrawn = await platformDb.transaction((tx) => withdrawImportFiles(tx, organizationId, now, { personId }));
    expect(withdrawn).toEqual({ imports: 2, files: 4 });
    for (const { id } of [done, waiting]) {
      expect(await attachmentsOf(id)).toBe(0);
      const kept = await keptOf(organizationId, id);
      expect(kept.batch).toMatchObject({ status: "expired", fileAttachmentId: null, reportAttachmentId: null });
      expect(kept.columns.every((column) => column.samples.length === 0)).toBe(true);
      expect(kept.valueMatches).toBe(0);
      expect(kept.rows.every((row) => row.exampleName === null && row.passwordHash === null)).toBe(true);
    }
    const rows = (await keptOf(organizationId, done.id)).rows;
    // The erased customer's row keeps its outcome but no longer names them; another person's row is as it was.
    expect(rows.map((row) => [row.rowNumber, row.outcome, row.personId, row.leadId, row.fingerprint !== null])).toEqual(
      [
        [2, "added", null, null, false],
        [3, "added", expect.any(String), null, true],
        [4, null, null, null, false],
      ],
    );
    expect(await attachmentsOf(untouched.id)).toBe(2);
    expect((await keptOf(elsewhere, untouched.id)).rows[0]?.personId).toBe(personId);
  });
});
