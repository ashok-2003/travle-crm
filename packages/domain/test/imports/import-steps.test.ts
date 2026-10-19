// An import's steps (spec 3.2, B29, B30; Review Focus 4): the file goes straight to storage and is read once its upload
// is confirmed; Add is pressed once, one import of the agency adds at a time, Stop twice changes nothing, Cancel ends a
// waiting import, and every step out of turn answers IMPORT_NOT_READY.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  cancelImport,
  confirmImportUpload,
  decideLeadImport,
  findImport,
  holdImport,
  importDetail,
  requestImportAdd,
  startImport,
  startImportFromBytes,
  stopImport,
} from "../../src/imports/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { aBatch, aRow } from "./support/batches.js";
import {
  anAgency,
  auditOf,
  bytes,
  createTestImports,
  eventsOf,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

const csv = "text/csv" as const;
const notReady = { code: "CONFLICT", reason: "IMPORT_NOT_READY" };

describe("an import's steps", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const batchOf = (id: string) => inOrg((tx) => findImport(tx, importer, "leads", id));

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("starts an import with a presigned upload for its file, and reads it once the upload is confirmed", async () => {
    const file = bytes("Name,Phone\nAsha,98765 43210\n");
    const now = new Date();
    const started = await startImport(
      test.db,
      test.files,
      importer,
      "leads",
      {
        fileName: "enquiries-oct-2026.csv",
        contentType: csv,
        sizeBytes: file.byteLength,
      },
      now,
    );
    expect(await batchOf(started.importId)).toMatchObject({
      status: "uploading",
      fileName: "enquiries-oct-2026.csv",
      fileKind: "csv",
      fileAttachmentId: started.attachmentId,
      startedBy: importer.userId,
      impersonatedBy: null,
    });
    await test.storage.upload(started.upload, file, csv);
    await confirmImportUpload(test.db, test.files, importer, "leads", started.importId, now);
    // Asked again (a retried request): nothing more happens.
    await confirmImportUpload(test.db, test.files, importer, "leads", started.importId, now);
    expect(await batchOf(started.importId)).toMatchObject({ status: "reading" });
    const uploaded = (await eventsOf(test, organizationId, ["import.uploaded"])).filter(
      ([, payload]) => (payload as { importId: string }).importId === started.importId,
    );
    expect(uploaded).toEqual([["import.uploaded", { importId: started.importId }]]);
  });

  it("leaves the import cancelled when its upload is refused", async () => {
    const full = createTestImports({ storageLimitBytes: 10 });
    const organization = await anAgency(full, "Full storage");
    const person = memberOf(organization);
    try {
      await expect(
        startImport(
          full.db,
          full.files,
          person,
          "leads",
          { fileName: "big.csv", contentType: csv, sizeBytes: 11 },
          new Date(),
        ),
      ).rejects.toMatchObject({ reason: "STORAGE_LIMIT_REACHED" });
      const batches = await full.db.forOrg(organization, (tx) => tx.importBatch.findMany());
      expect(batches.map((batch) => batch.status)).toEqual(["cancelled"]);
    } finally {
      await full.close();
    }
  });

  it("answers IMPORT_NOT_READY to a second Add, queues one add and records one import.started", async () => {
    const organization = await anAgency(test, "Pressed twice");
    const person = memberOf(organization);
    const { id } = await test.db.forOrg(organization, (tx) => aBatch(tx, { startedBy: person.userId, rowsToAdd: 42 }));
    const presses = await Promise.allSettled([
      requestImportAdd(test.db, person, "leads", id, new Date()),
      requestImportAdd(test.db, person, "leads", id, new Date()),
    ]);
    expect(presses.filter((press) => press.status === "fulfilled")).toHaveLength(1);
    expect(presses.find((press) => press.status === "rejected")?.reason).toMatchObject(notReady);
    await expect(requestImportAdd(test.db, person, "leads", id, new Date())).rejects.toMatchObject(notReady);
    const batch = await test.db.forOrg(organization, (tx) => findImport(tx, person, "leads", id));
    expect(batch).toMatchObject({ status: "adding", rowsDone: 0 });
    expect(batch.addRequestedAt).toBeInstanceOf(Date);
    expect(await eventsOf(test, organization, ["import.add-requested"])).toEqual([
      ["import.add-requested", { importId: id, kind: "leads" }],
    ]);
    const audit = await auditOf(test, organization, id);
    expect(audit.map((entry) => [entry.action, entry.after])).toEqual([
      ["import.started", { kind: "leads", rowsToAdd: 42 }],
    ]);
  });

  it("asks a kind's own condition with the import held, in the move's transaction; its refusal moves nothing", async () => {
    const organization = await anAgency(test, "Its own condition");
    const person = memberOf(organization);
    const seen: string[] = [];
    // What the condition writes stands or falls with the move: it is the move's own transaction.
    const condition = (refuse: boolean) => async (tx: OrgTx, batch: { id: string; status: string }) => {
      seen.push(batch.status);
      await tx.importBatch.update({ where: { id: batch.id }, data: { addBlocked: true } });
      if (refuse) throw new Error("The kind refuses");
    };
    const { id: refused } = await test.db.forOrg(organization, (tx) => aBatch(tx, { startedBy: person.userId }));
    await expect(requestImportAdd(test.db, person, "leads", refused, new Date(), condition(true))).rejects.toThrow(
      "The kind refuses",
    );
    expect(await test.db.forOrg(organization, (tx) => findImport(tx, person, "leads", refused))).toMatchObject({
      status: "checked",
      addBlocked: false,
    });
    expect(await eventsOf(test, organization, ["import.add-requested"])).toEqual([]);
    expect(await auditOf(test, organization, refused)).toEqual([]);

    const { id: allowed } = await test.db.forOrg(organization, (tx) => aBatch(tx, { startedBy: person.userId }));
    await requestImportAdd(test.db, person, "leads", allowed, new Date(), condition(false));
    expect(await test.db.forOrg(organization, (tx) => findImport(tx, person, "leads", allowed))).toMatchObject({
      status: "adding",
      addBlocked: true,
    });
    expect(seen).toEqual(["checked", "checked"]);
  });

  it("answers IMPORT_ALREADY_RUNNING while another import of the agency is adding", async () => {
    const organization = await anAgency(test, "One at a time");
    const person = memberOf(organization);
    const colleague = memberOf(organization);
    await test.db.forOrg(organization, (tx) =>
      aBatch(tx, { startedBy: colleague.userId, status: "adding", kind: "staff" }),
    );
    const { id } = await test.db.forOrg(organization, (tx) => aBatch(tx, { startedBy: person.userId }));
    await expect(requestImportAdd(test.db, person, "leads", id, new Date())).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "IMPORT_ALREADY_RUNNING",
    });
    expect(await test.db.forOrg(organization, (tx) => findImport(tx, person, "leads", id))).toMatchObject({
      status: "checked",
    });
    expect(await auditOf(test, organization, id)).toEqual([]);
  });

  it("changes nothing on a second Stop, and refuses Cancel while adding", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "adding" }));
    await inOrg((tx) => stopImport(tx, importer, "leads", id));
    await inOrg((tx) => stopImport(tx, importer, "leads", id));
    expect(await batchOf(id)).toMatchObject({ status: "adding", stopRequested: true });
    await expect(inOrg((tx) => cancelImport(tx, importer, "leads", id, new Date()))).rejects.toMatchObject(notReady);
    const { id: waiting } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "matching" }));
    await expect(inOrg((tx) => stopImport(tx, importer, "leads", waiting))).rejects.toMatchObject(notReady);
    expect(await auditOf(test, organizationId, id)).toEqual([]);
  });

  it("takes Stop at once while a batch of the add holds the import, for the add to read after it (X7)", async () => {
    // An agency of its own: one import of an agency adds at a time.
    const organization = await anAgency(test, "Stop while a batch adds");
    const person = memberOf(organization);
    const inAgency = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organization, work);
    const { id } = await inAgency((tx) => aBatch(tx, { startedBy: person.userId, status: "adding" }));
    // A batch of the add, holding the import as it adds its rows.
    const turns: { held?: () => void; release?: () => void } = {};
    const held = new Promise<void>((resolve) => (turns.held = resolve));
    const released = new Promise<void>((resolve) => (turns.release = resolve));
    const batch = inAgency(async (tx) => {
      expect((await holdImport(tx, id))?.stopRequested).toBe(false);
      turns.held?.();
      await released;
    });
    await held;
    const started = performance.now();
    await inAgency((tx) => stopImport(tx, person, "leads", id));
    expect(performance.now() - started).toBeLessThan(1000);
    turns.release?.();
    await batch;
    // The add's next batch holds the import and finds Stop.
    expect(await inAgency((tx) => holdImport(tx, id))).toMatchObject({ status: "adding", stopRequested: true });
  }, 10_000);

  it("cancels a waiting import and records import.cancelled with no file name", async () => {
    for (const status of ["uploading", "reading", "matching", "checking", "checked"]) {
      const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status }));
      await inOrg((tx) => cancelImport(tx, importer, "leads", id, new Date()));
      expect(await batchOf(id), status).toMatchObject({ status: "cancelled" });
      const audit = await auditOf(test, organizationId, id);
      expect(audit.map((entry) => [entry.action, entry.entityType, entry.after])).toEqual([
        ["import.cancelled", "import_batch", { kind: "leads", status }],
      ]);
      expect(JSON.stringify(audit)).not.toContain("enquiries");
      await expect(inOrg((tx) => cancelImport(tx, importer, "leads", id, new Date()))).rejects.toMatchObject(notReady);
    }
  });

  it("forgets a cancelled staff import's password hashes at once, not with the sweep (B53)", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, kind: "staff" }));
    await inOrg(async (tx) => {
      await aRow(tx, { batchId: id, rowNumber: 2, passwordHash: "hash" });
      await aRow(tx, { batchId: id, rowNumber: 3 });
    });
    await inOrg((tx) => cancelImport(tx, importer, "staff", id, new Date()));
    const rows = await inOrg((tx) => tx.importRow.findMany({ where: { batchId: id }, select: { passwordHash: true } }));
    expect(rows).toEqual([{ passwordHash: null }, { passwordHash: null }]);
  });

  it("keeps the importer's choices for blocked and already imported rows at the preview, and nowhere else", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    await inOrg((tx) => decideLeadImport(tx, importer, { importId: id, addBlocked: true, addAlreadyImported: false }));
    expect(await batchOf(id)).toMatchObject({ addBlocked: true, addAlreadyImported: false, status: "checked" });
    // A file's preview never asks about rows already in the CRM: off.
    expect(await batchOf(id)).toMatchObject({ addInCrm: false });
    const { id: adding } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "done" }));
    await expect(
      inOrg((tx) => decideLeadImport(tx, importer, { importId: adding, addBlocked: true, addAlreadyImported: true })),
    ).rejects.toMatchObject(notReady);
  });

  it("keeps a sheet's in-CRM choice, and shows the import's sheet and choices", async () => {
    const sheetId = "0199e7a0-0000-7000-8000-0000000000c3";
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, sourceSheetId: sheetId }));
    await inOrg((tx) =>
      decideLeadImport(tx, importer, { importId: id, addBlocked: false, addAlreadyImported: false, addInCrm: true }),
    );
    const detail = await inOrg((tx) => importDetail(tx, importer, "leads", id));
    expect(detail).toMatchObject({
      sourceSheet: { sheetId },
      choices: { addBlocked: false, addAlreadyImported: false, addInCrm: true },
    });
    const file = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId }));
    expect(await inOrg((tx) => importDetail(tx, importer, "leads", file.id))).toMatchObject({
      sourceSheet: null,
      choices: { addInCrm: false },
    });
  });

  it("starts a sheet's import from its rows' bytes once, however often asked, for the worker to read", async () => {
    const importId = "0199e7a0-0000-7000-8000-0000000000c4";
    const sourceSheetId = "0199e7a0-0000-7000-8000-0000000000c5";
    const now = new Date("2026-10-22T08:00:00Z");
    const input = {
      importId,
      organizationId,
      startedBy: importer.userId,
      impersonatedBy: null,
      fileName: "Goa Diwali campaign.csv",
      bytes: bytes("Name,Phone\nAsha,98765 43210\n"),
      sourceSheetId,
    };
    await expect(startImportFromBytes(test.db, test.files, input, now)).resolves.toEqual({ importId });
    await expect(startImportFromBytes(test.db, test.files, input, now)).resolves.toEqual({ importId });
    expect(await batchOf(importId)).toMatchObject({
      kind: "leads",
      status: "reading",
      fileName: "Goa Diwali campaign.csv",
      fileKind: "csv",
      sourceSheetId,
      addInCrm: false,
      keepUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    const uploaded = await eventsOf(test, organizationId, ["import.uploaded"]);
    expect(uploaded.filter(([, payload]) => JSON.stringify(payload).includes(importId))).toEqual([
      ["import.uploaded", { importId }],
    ]);
    const files = await test.files.list(systemActor(organizationId), {
      recordType: "import_batch",
      recordId: importId,
    });
    expect(files).toEqual([expect.objectContaining({ contentType: "text/csv", sizeBytes: input.bytes.byteLength })]);
    expect((await batchOf(importId)).fileAttachmentId).toBe(files[0]?.id);
  });
});
