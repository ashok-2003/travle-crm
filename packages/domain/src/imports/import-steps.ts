// An import's steps the importer takes (spec 3.2, 7): start (a presigned upload for the file), confirm the upload (the
// worker reads it), Add, Stop, Cancel, and the choices for blocked and already imported rows. Each step happens at
// its own status only, else IMPORT_NOT_READY; each status change keeps the import a week from now (D5).
import type { DecideLeadImportInput } from "@travel-crm/contracts/crm";
import { type ImportKind, type StartImportInput, waitingImportStatuses } from "@travel-crm/contracts/imports";
import { type Database, isUniqueViolation, type OrgTx } from "@travel-crm/db";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import { recordAudit } from "../audit/index.js";
import { type Files, IMPORT_FILE_RECORD_TYPE } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import { findImport, holdImport, keepUntilFrom, moveImport, notReady } from "./batches.js";

/**
 * Records the import and asks storage for the file's upload, under the import as its record. A refused upload (the
 * agency's storage is full) leaves the import cancelled, with the files module's own refusal.
 */
export async function startImport(
  db: Database,
  files: Files,
  access: MemberAccess,
  kind: ImportKind,
  input: StartImportInput,
  now: Date,
): Promise<{ importId: string; attachmentId: string; upload: PresignedUpload }> {
  const batch = await db.forOrg(access.organizationId, (tx) =>
    tx.importBatch.create({
      data: {
        kind,
        fileName: input.fileName,
        fileKind: input.contentType === "text/csv" ? "csv" : "xlsx",
        startedBy: access.userId,
        impersonatedBy: access.impersonatedBy,
        keepUntil: keepUntilFrom(now),
      },
      select: { id: true },
    }),
  );
  let requested: Awaited<ReturnType<Files["requestUpload"]>>;
  try {
    requested = await files.requestUpload(access, {
      recordType: IMPORT_FILE_RECORD_TYPE,
      recordId: batch.id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sensitive: false,
    });
  } catch (error) {
    await db.forOrg(access.organizationId, (tx) =>
      moveImport(tx, batch.id, ["uploading"], "cancelled", now, { finishedAt: now }),
    );
    throw error;
  }
  await db.forOrg(access.organizationId, (tx) =>
    tx.importBatch.update({ where: { id: batch.id }, data: { fileAttachmentId: requested.attachment.id } }),
  );
  return { importId: batch.id, attachmentId: requested.attachment.id, upload: requested.upload };
}

/**
 * Once storage holds the file, the import moves to reading and import.uploaded is published for the worker. Asked
 * again while reading (a retried request), it does nothing; two at once publish once.
 */
export async function confirmImportUpload(
  db: Database,
  files: Files,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
  now: Date,
): Promise<void> {
  const batch = await db.forOrg(access.organizationId, (tx) => findImport(tx, access, kind, importId));
  if (batch.status === "reading") return;
  if (batch.status !== "uploading" || batch.fileAttachmentId === null) throw notReady();
  await files.confirmUpload(access, {
    recordType: IMPORT_FILE_RECORD_TYPE,
    recordId: importId,
    attachmentId: batch.fileAttachmentId,
  });
  await db.forOrg(access.organizationId, async (tx) => {
    if (await moveImport(tx, importId, ["uploading"], "reading", now)) {
      await publishEvent(tx, { type: "import.uploaded", payload: { importId } });
    }
  });
}

/**
 * A check the Add request runs in its own transaction, before the import moves to adding; one that throws (a Google
 * Sheet's check that is saving, S26) refuses the Add and leaves the import at its preview.
 */
export type AddGuard = (tx: OrgTx, now: Date) => Promise<void>;

/**
 * Add (B26, B29): from the preview only, so a second press, or one in another tab, answers IMPORT_NOT_READY and
 * queues nothing. One import of an agency adds at a time (import_batch_one_adding): IMPORT_ALREADY_RUNNING.
 */
export async function requestImportAdd(
  db: Database,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
  now: Date,
  /** A kind's own condition, asked once the import is held, in the same transaction that moves it (it throws to refuse). */
  whileHeld?: (tx: OrgTx, batch: ImportBatchRow) => Promise<void>,
): Promise<void> {
  try {
    await db.forOrg(access.organizationId, async (tx) => {
      await findImport(tx, access, kind, importId);
      // Held, so two presses take turns and the second finds it adding.
      const batch = await holdImport(tx, importId);
      if (batch?.status !== "checked") throw notReady();
      await whileHeld?.(tx, batch);
      await moveImport(tx, importId, ["checked"], "adding", now, { addRequestedAt: now, rowsDone: 0 });
      await recordAudit(tx, access, {
        action: "import.started",
        entityType: "import_batch",
        entityId: importId,
        after: { kind, rowsToAdd: batch.rowsToAdd },
      });
      await publishEvent(tx, { type: "import.add-requested", payload: { importId, kind } });
    });
  } catch (error) {
    // The only unique rule moving to adding can break; the failed statement ended the transaction, so it's told here.
    if (!isUniqueViolation(error)) throw error;
    throw new DomainError("CONFLICT", "IMPORT_ALREADY_RUNNING", "Another import of this organization is adding");
  }
}

/**
 * Stop (B28): the add finishes the batch under way and ends stopped. It never waits for that batch, which holds the
 * import's row: the request is a row of its own, whose key only key-shares the import's (X7). A second Stop changes
 * nothing.
 */
export async function stopImport(tx: OrgTx, access: MemberAccess, kind: ImportKind, importId: string): Promise<void> {
  const batch = await findImport(tx, access, kind, importId);
  if (batch.status !== "adding") throw notReady();
  await tx.importStopRequest.createMany({ data: [{ batchId: importId }], skipDuplicates: true });
}

/** Cancel this import: from a step it waits at only, never while it adds. */
export async function cancelImport(
  tx: OrgTx,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
  now: Date,
): Promise<void> {
  const batch = await findImport(tx, access, kind, importId);
  if (!(await moveImport(tx, importId, waitingImportStatuses, "cancelled", now, { finishedAt: now }))) throw notReady();
  // A staff import's password hashes have no use once it is cancelled: they go now, not with the sweep (B53).
  await tx.importRow.updateMany({
    where: { batchId: importId, passwordHash: { not: null } },
    data: { passwordHash: null },
  });
  // The kind and the step it left, never the file's name: it may name a customer.
  await recordAudit(tx, access, {
    action: "import.cancelled",
    entityType: "import_batch",
    entityId: importId,
    after: { kind, status: batch.status },
  });
}

/**
 * The preview's choices (B16, B30, B33, and a sheet's rows already in the CRM): kept on the import for the add,
 * without a new check. A preview that doesn't ask about the CRM's rows (a file's) leaves them out.
 */
export async function decideLeadImport(tx: OrgTx, access: MemberAccess, input: DecideLeadImportInput): Promise<void> {
  const batch = await findImport(tx, access, "leads", input.importId);
  if (batch.status !== "checked") throw notReady();
  await tx.importBatch.update({
    where: { id: input.importId },
    data: {
      addBlocked: input.addBlocked,
      addAlreadyImported: input.addAlreadyImported,
      addInCrm: input.addInCrm ?? false,
    },
  });
}
