// Getting files into storage: a presigned upload the browser sends itself, the check that it arrived as promised,
// and files the server makes (rendered PDFs).
import {
  attachmentFileName,
  type AttachmentRefInput,
  type AttachmentSummary,
  type RequestUploadInput,
} from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { isUniqueViolation, withDeleted } from "@travel-crm/db";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import { DomainError, type Actor } from "../kernel/index.js";
import {
  attachmentFields,
  type AttachmentRow,
  findAttachment,
  storageKeyOf,
  summaryFor,
  toSummary,
} from "./attachment-row.js";
import type { FilesDependencies, GeneratedFile } from "./dependencies.js";

/** Long enough for a slow phone connection to send 25 MB. */
const UPLOAD_URL_SECONDS = 10 * 60;

/** Bytes the organization keeps in storage: every attachment, deleted ones too, until a purge removes them. */
export async function bytesStored(tx: OrgTx): Promise<number> {
  const totals = await withDeleted(() => tx.attachment.aggregate({ _sum: { sizeBytes: true } }));
  return totals._sum.sizeBytes ?? 0;
}

export async function requestUpload(
  { db, storage, storageLimitBytes }: FilesDependencies,
  actor: Actor,
  input: RequestUploadInput,
): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }> {
  const limit = storageLimitBytes ? await storageLimitBytes(actor.organizationId) : null;
  // A pending upload counts at once, so a burst of uploads can't overshoot the limit by much. Two requests at the
  // same moment may both pass: the limit is a plan's, not a safety rule.
  const row = await db.forOrg(actor.organizationId, async (tx) => {
    if (limit !== null && (await bytesStored(tx)) + input.sizeBytes > limit) {
      throw new DomainError("LIMIT_REACHED", "STORAGE_LIMIT_REACHED", "This organization's file storage is full");
    }
    return tx.attachment.create({
      data: {
        recordType: input.recordType,
        recordId: input.recordId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sensitive: input.sensitive,
        createdBy: actor.userId,
      },
      select: attachmentFields,
    });
  });
  const upload = await storage.presignUpload(
    { key: storageKeyOf(row), contentType: row.contentType, sizeBytes: row.sizeBytes },
    UPLOAD_URL_SECONDS,
  );
  return { attachment: toSummary(row), upload };
}

/**
 * Marks an upload ready once storage holds the promised file. Confirming twice is harmless, which is what a client
 * does when its retried PUT is answered 412: storage already holds the first upload.
 */
export async function confirmUpload(
  { db, storage }: FilesDependencies,
  actor: Actor,
  input: AttachmentRefInput,
): Promise<AttachmentSummary> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input));
  if (row.status === "ready") return summaryFor(actor, row);
  const stored = await storage.head(storageKeyOf(row));
  if (!stored) throw new DomainError("NOT_FOUND", "UPLOAD_NOT_FOUND", "The file hasn't arrived in storage");
  if (stored.sizeBytes !== row.sizeBytes || stored.contentType !== row.contentType) {
    throw new DomainError("VALIDATION", "UPLOAD_DOES_NOT_MATCH", "The stored file isn't the one that was announced");
  }
  return db.forOrg(actor.organizationId, async (tx) => {
    await tx.attachment.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "ready", confirmedAt: new Date() },
    });
    return summaryFor(actor, await findAttachment(tx, input));
  });
}

/**
 * Stores a file the server made, such as a rendered PDF, ready at once. The row is written first and marked ready
 * after the upload, so storage never holds a file no row accounts for; a failed upload leaves only a pending row,
 * which nobody can list or download.
 *
 * Safe to retry: with a caller-chosen `attachmentId`, a file already stored under it for the same record is returned
 * as it is, and a pending one is completed. The same id on another record is refused.
 */
export async function storeGeneratedFile(
  { db, storage }: FilesDependencies,
  actor: Actor,
  file: GeneratedFile,
): Promise<AttachmentSummary> {
  const name = attachmentFileName.safeParse(file.fileName);
  if (!name.success) throw new DomainError("VALIDATION", "INVALID_FILE_NAME", "The file name can't be used");
  if (file.body.byteLength === 0) throw new DomainError("VALIDATION", "EMPTY_FILE", "The file is empty");
  const inUse = () => new DomainError("CONFLICT", "ATTACHMENT_ID_IN_USE", "That file id is already used");
  /** A row already stored under the chosen id: ours to continue if it is this record's and not deleted. */
  const existingRow = (): Promise<AttachmentRow | null> =>
    db.forOrg(actor.organizationId, async (tx) => {
      const existing = await withDeleted(() =>
        tx.attachment.findUnique({
          where: { id: file.attachmentId },
          select: { ...attachmentFields, deletedAt: true },
        }),
      );
      if (!existing) return null;
      if (existing.recordType !== file.recordType || existing.recordId !== file.recordId || existing.deletedAt) {
        throw inUse();
      }
      return existing;
    });
  const create = () =>
    db.forOrg(actor.organizationId, (tx) =>
      tx.attachment.create({
        data: {
          ...(file.attachmentId === undefined ? {} : { id: file.attachmentId }),
          recordType: file.recordType,
          recordId: file.recordId,
          fileName: name.data,
          contentType: file.contentType,
          sizeBytes: file.body.byteLength,
          sensitive: file.sensitive ?? false,
          createdBy: actor.userId,
        },
        select: attachmentFields,
      }),
    );

  let row: AttachmentRow;
  if (file.attachmentId === undefined) {
    row = await create();
  } else {
    const existing = await existingRow();
    if (existing) {
      row = existing;
    } else {
      try {
        row = await create();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another run created it first, or the id is another organization's (which this one can't see).
        const raced = await existingRow();
        if (!raced) throw inUse();
        row = raced;
      }
    }
  }
  // Someone else's earlier run already finished it: show what that caller may see, not what the retry sent.
  if (row.status === "ready") return summaryFor(actor, row);
  await storage.put({ key: storageKeyOf(row), contentType: file.contentType, body: file.body });
  return db.forOrg(actor.organizationId, async (tx) =>
    toSummary(
      await tx.attachment.update({
        where: { id: row.id },
        // A retry may carry a different body than the failed first run left announced: keep the row true to storage.
        data: {
          status: "ready",
          confirmedAt: new Date(),
          sizeBytes: file.body.byteLength,
          contentType: file.contentType,
        },
        select: attachmentFields,
      }),
    ),
  );
}
