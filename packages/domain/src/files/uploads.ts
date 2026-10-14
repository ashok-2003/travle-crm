// Getting files into storage: a presigned upload the browser sends itself, the check that it arrived as promised,
// and files the server makes (rendered PDFs).
import type { AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import { DomainError, type Actor } from "../kernel/index.js";
import { attachmentFields, findAttachment, storageKeyOf, toSummary } from "./attachment-row.js";
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

/** Marks an upload ready once storage holds the promised file. Confirming twice is harmless. */
export async function confirmUpload(
  { db, storage }: FilesDependencies,
  actor: Actor,
  input: { attachmentId: string },
): Promise<AttachmentSummary> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input.attachmentId));
  if (row.status === "ready") return toSummary(row);
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
    return toSummary(await findAttachment(tx, row.id));
  });
}

/**
 * Stores a file the server made, such as a rendered PDF, ready at once. The row is written first and marked ready
 * after the upload, so storage never holds a file no row accounts for; a failed upload leaves only a pending row,
 * which nobody can list or download.
 */
export async function storeGeneratedFile(
  { db, storage }: FilesDependencies,
  actor: Actor,
  file: GeneratedFile,
): Promise<AttachmentSummary> {
  if (file.body.byteLength === 0) throw new DomainError("VALIDATION", "EMPTY_FILE", "The file is empty");
  const row = await db.forOrg(actor.organizationId, (tx) =>
    tx.attachment.create({
      data: {
        recordType: file.recordType,
        recordId: file.recordId,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.body.byteLength,
        sensitive: file.sensitive ?? false,
        createdBy: actor.userId,
      },
      select: attachmentFields,
    }),
  );
  await storage.put({ key: storageKeyOf(row), contentType: row.contentType, body: file.body });
  return db.forOrg(actor.organizationId, async (tx) =>
    toSummary(
      await tx.attachment.update({
        where: { id: row.id },
        data: { status: "ready", confirmedAt: new Date() },
        select: attachmentFields,
      }),
    ),
  );
}
