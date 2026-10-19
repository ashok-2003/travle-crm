// An import's end (spec 3.2 step 4, B28, B34, B36): once, with every row given an outcome, import.finished with the
// counts and one notice to the importer; and the report downloaded through a 5-minute link, recorded in the audit log.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { findImport, finishImport, importReportLink, type ImportEnd } from "../../src/imports/index.js";
import { aBatch, aRow } from "./support/batches.js";
import {
  anAgency,
  anImportWithFile,
  auditOf,
  createTestImports,
  eventsOf,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

/** Each add has its own event, so each call its own source of the notice. */
const ended = (end: Partial<ImportEnd> = {}): ImportEnd => ({
  status: "done",
  sourceEventId: randomUUID(),
  notifyImporter: true,
  report: false,
  ...end,
});

describe("an import's end", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const outcomesOf = (id: string) =>
    inOrg(async (tx) =>
      (await tx.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" } })).map((row) => [
        row.rowNumber,
        row.outcome,
        row.reasons,
      ]),
    );
  const finish = (id: string, end: Partial<ImportEnd> = {}) =>
    finishImport(listenerContext(test, organizationId), jobDependencies(test), id, ended(end));

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("ends an import once, with import.finished, the counts and one notice to the importer", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "adding" }));
    await inOrg(async (tx) => {
      await aRow(tx, { batchId: id, rowNumber: 2, outcome: "added" });
      await aRow(tx, { batchId: id, rowNumber: 3, outcome: "added" });
      await aRow(tx, { batchId: id, rowNumber: 4, plan: "enquiry", outcome: "merged" });
      await aRow(tx, { batchId: id, rowNumber: 5, plan: "not_added", reasons: ["no_contact"] });
    });
    const also: string[] = [];
    const now = Date.now();
    await finishImport(listenerContext(test, organizationId), jobDependencies(test), id, ended(), (_tx, batch) => {
      also.push(batch.id);
      return Promise.resolve();
    });
    await finish(id);
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    expect(batch).toMatchObject({ status: "done", failureReason: null, reportAttachmentId: null });
    expect(batch.finishedAt?.getTime()).toBeGreaterThanOrEqual(now - 1000);
    expect(also).toEqual([id]);
    expect(await eventsOf(test, organizationId, ["import.finished"])).toEqual([
      ["import.finished", { importId: id, kind: "leads" }],
    ]);
    const audit = await auditOf(test, organizationId, id);
    expect(audit.map((entry) => [entry.action, entry.source, entry.after])).toEqual([
      [
        "import.finished",
        "job",
        {
          kind: "leads",
          status: "done",
          failureReason: null,
          outcomes: { added: 2, merged: 1, left_out: 0, not_added: 1 },
        },
      ],
    ]);
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "import.finished" } }));
    expect(notices.map((notice) => [notice.recipientUserId, notice.title, notice.body, notice.link])).toEqual([
      [
        importer.userId,
        "Your import is done",
        "2 new leads, 1 repeat enquiry. 1 row wasn't added.",
        `/leads/import/${id}`,
      ],
    ]);
  });

  it("marks rows never reached 'Stopped before this row' and un-ticked blocked rows left out", async () => {
    const { id } = await inOrg((tx) =>
      aBatch(tx, { startedBy: importer.userId, status: "adding", addAlreadyImported: true }),
    );
    await inOrg(async (tx) => {
      await aRow(tx, { batchId: id, rowNumber: 2, outcome: "added" });
      await aRow(tx, { batchId: id, rowNumber: 3, plan: "blocked", reasons: ["blocked"] });
      await aRow(tx, { batchId: id, rowNumber: 4, plan: "already_imported", reasons: ["already_imported:2026-10-12"] });
      await aRow(tx, { batchId: id, rowNumber: 5, plan: "new" });
      await aRow(tx, { batchId: id, rowNumber: 6, plan: "not_added", reasons: ["no_name"] });
    });
    await finish(id, { status: "stopped" });
    expect(await outcomesOf(id)).toEqual([
      [2, "added", []],
      [3, "left_out", ["blocked"]],
      // Ticked to add again, but the add stopped first.
      [4, "not_added", ["not_reached"]],
      [5, "not_added", ["not_reached"]],
      [6, "not_added", ["no_name"]],
    ]);
    const notice = await inOrg((tx) => tx.notification.findFirstOrThrow({ where: { link: `/leads/import/${id}` } }));
    expect([notice.title, notice.body]).toEqual(["Your import was stopped", "1 new lead. 4 rows weren't added."]);
    const { id: failed } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "adding" }));
    await finish(failed, { status: "failed", failureReason: "lost_permission" });
    expect(await inOrg((tx) => findImport(tx, importer, "leads", failed))).toMatchObject({
      status: "failed",
      failureReason: "lost_permission",
    });
    const failure = await inOrg((tx) =>
      tx.notification.findFirstOrThrow({ where: { link: `/leads/import/${failed}` } }),
    );
    expect([failure.title, failure.body]).toEqual([
      "Your import stopped",
      "You can no longer import leads. The rows added before it stay.",
    ]);
    // An import not adding is left alone.
    const { id: checked } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "checked" }));
    await finish(checked);
    expect(await inOrg((tx) => findImport(tx, importer, "leads", checked))).toMatchObject({ status: "checked" });
  });

  it("leaves a sheet's un-ticked rows already in the CRM out with their reason, and a ticked one not reached (X2)", async () => {
    for (const addInCrm of [false, true]) {
      const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "adding", addInCrm }));
      await inOrg(async (tx) => {
        await aRow(tx, { batchId: id, rowNumber: 2, plan: "in_crm", reasons: ["in_crm_open"] });
        await aRow(tx, { batchId: id, rowNumber: 3, plan: "in_crm", reasons: ["in_crm_closed"] });
      });
      await finish(id, { status: "stopped" });
      expect(await outcomesOf(id), String(addInCrm)).toEqual(
        addInCrm
          ? [
              [2, "not_added", ["not_reached"]],
              [3, "not_added", ["not_reached"]],
            ]
          : [
              [2, "left_out", ["in_crm_open"]],
              [3, "left_out", ["in_crm_closed"]],
            ],
      );
    }
  });

  it("downloads the report through a 5-minute link, recording import.report-downloaded", async () => {
    const file = test.spreadsheets.bytesOf({ header: ["Name", "Mobile"], rows: [["Asha", null]] });
    const { id } = await anImportWithFile(test, importer, file, { status: "adding" });
    await inOrg((tx) => aRow(tx, { batchId: id, rowNumber: 2, plan: "not_added", reasons: ["no_contact"] }));
    await expect(importReportLink(test.db, test.files, importer, "leads", id)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "EXPORT_NOT_READY",
    });
    await finish(id, { report: true, notifyImporter: false });
    const link = await importReportLink(test.db, test.files, importer, "leads", id);
    const seconds = (link.expiresAt.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(280);
    expect(seconds).toBeLessThanOrEqual(300);
    const audit = await auditOf(test, organizationId, id);
    expect(audit.map((entry) => [entry.action, entry.after])).toContainEqual([
      "import.report-downloaded",
      { kind: "leads" },
    ]);
    await expect(importReportLink(test.db, test.files, memberOf(organizationId), "leads", id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Once swept: its file is gone for good.
    await inOrg((tx) =>
      tx.importBatch.update({ where: { id }, data: { status: "expired", reportAttachmentId: null } }),
    );
    await expect(importReportLink(test.db, test.files, importer, "leads", id)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "EXPORT_EXPIRED",
    });
  });
});
