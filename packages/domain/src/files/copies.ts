// A stored file copied onto another record, inside storage (S3's CopyObject), so the bytes never pass through the api: a
// trip's photo or PDF saved once (sales inbox, trip details) becomes the file of each WhatsApp message that sends it. The
// copy is a file of its own, counted in the organization's storage like any other, and removed with its record.
import type { AttachmentRefInput, AttachmentSummary } from "@travel-crm/contracts/files";
import type { Actor } from "../kernel/index.js";
import { DomainError } from "../kernel/index.js";
import { attachmentFields, storageKeyOf, toSummary } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { assertTypeAllowed, bytesStored } from "./uploads.js";

export async function copyFile(
  { db, storage, storageLimitBytes }: FilesDependencies,
  actor: Actor,
  from: AttachmentRefInput,
  to: { recordType: string; recordId: string },
): Promise<AttachmentSummary> {
  const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "The file is not stored");
  const source = await db.forOrg(actor.organizationId, (tx) =>
    tx.attachment.findFirst({
      where: { id: from.attachmentId, recordType: from.recordType, recordId: from.recordId, status: "ready" },
      select: attachmentFields,
    }),
  );
  if (source === null) throw notFound();
  assertTypeAllowed(to.recordType, source.contentType);
  // The same copy asked for again (the caller names the record by its token, so a retry names the same one) finds the row an
  // earlier try made: a ready one is the answer, a pending one is finished, and no second copy is made or counted.
  // A new copy is pending until storage holds the bytes: one that fails leaves a row nothing reads, as an abandoned upload does,
  // and it counts toward the storage limit at once, as an upload does.
  const limit = storageLimitBytes ? await storageLimitBytes(actor.organizationId) : null;
  const copy = await db.forOrg(actor.organizationId, async (tx) => {
    const earlier = await tx.attachment.findFirst({
      where: {
        recordType: to.recordType,
        recordId: to.recordId,
        fileName: source.fileName,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
      },
      select: attachmentFields,
    });
    if (earlier !== null) return earlier;
    if (limit !== null && (await bytesStored(tx, actor.organizationId)) + source.sizeBytes > limit) {
      throw new DomainError("LIMIT_REACHED", "STORAGE_LIMIT_REACHED", "This organization's file storage is full");
    }
    return tx.attachment.create({
      data: {
        recordType: to.recordType,
        recordId: to.recordId,
        fileName: source.fileName,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
        sensitive: source.sensitive,
        createdBy: actor.userId,
      },
      select: attachmentFields,
    });
  });
  if (copy.status === "ready") return toSummary(copy);
  if (!(await storage.copy(storageKeyOf(source), storageKeyOf(copy)))) throw notFound();
  const ready = await db.forOrg(actor.organizationId, (tx) =>
    tx.attachment.update({
      where: { id: copy.id },
      data: { status: "ready", confirmedAt: new Date() },
      select: attachmentFields,
    }),
  );
  return toSummary(ready);
}
