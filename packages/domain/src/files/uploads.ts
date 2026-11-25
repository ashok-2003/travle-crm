// Getting files into storage: a presigned upload the browser sends itself, and the check that it arrived as promised.
// Files the server makes are generated.ts's.
import type { AttachmentRefInput, AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import { DomainError, type Actor } from "../kernel/index.js";
import { attachmentFields, findAttachment, storageKeyOf, summaryFor, toSummary } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { allowedContentTypes, isSystemOwnedRecordType, maxUploadBytes } from "./record-types.js";

/**
 * Refuses a file whose type its record doesn't take: an import's file is CSV or .xlsx, and those two go nowhere else
 * (spec 5).
 */
export function assertTypeAllowed(recordType: string, contentType: string): void {
  if (!allowedContentTypes(recordType).includes(contentType)) {
    throw new DomainError("VALIDATION", "CONTENT_TYPE_NOT_ALLOWED", "This record doesn't take files of this type");
  }
}

/** Long enough for a slow phone connection to send 25 MB. */
const UPLOAD_URL_SECONDS = 10 * 60;

/** How long after an upload is asked for it may still be confirmed: past its link, for a retried or slow confirm. */
const CONFIRM_WITHIN_SECONDS = 60 * 60;

/**
 * Bytes the organization keeps in storage: every ready file holding its own bytes (a file sent again shares them and
 * adds nothing), deleted ones too until a purge removes them, and the uploads still pending while their link lasts. One that never finished (stopped, or refused at confirm) stops
 * counting when its link lapses, so a plan's storage never fills with files nobody can see; sweeping their rows and
 * objects is a later plan's. Named, not left to row-level security: the platform's own transaction sees every
 * organization's files.
 */
export async function bytesStored(tx: OrgTx, organizationId: string, now: Date = new Date()): Promise<number> {
  const linkLapsed = new Date(now.getTime() - UPLOAD_URL_SECONDS * 1000);
  const totals = await withDeleted(() =>
    tx.attachment.aggregate({
      where: {
        organizationId,
        storedAsId: null,
        OR: [{ status: "ready" }, { status: "pending", createdAt: { gt: linkLapsed } }],
      },
      _sum: { sizeBytes: true },
    }),
  );
  return totals._sum.sizeBytes ?? 0;
}

export async function requestUpload(
  { db, storage, storageLimitBytes }: FilesDependencies,
  actor: Actor,
  input: RequestUploadInput,
): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }> {
  if (isSystemOwnedRecordType(input.recordType)) {
    throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "Only the system stores files of this record");
  }
  assertTypeAllowed(input.recordType, input.contentType);
  if (input.sizeBytes > maxUploadBytes(input.recordType)) {
    throw new DomainError("VALIDATION", "IMPORT_FILE_TOO_LARGE", "An import's file is at most 10 MB");
  }
  const limit = storageLimitBytes ? await storageLimitBytes(actor.organizationId) : null;
  // A pending upload counts at once, so a burst of uploads can't overshoot the limit by much. Two requests at the
  // same moment may both pass: the limit is a plan's, not a safety rule.
  const row = await db.forOrg(actor.organizationId, async (tx) => {
    if (limit !== null && (await bytesStored(tx, actor.organizationId)) + input.sizeBytes > limit) {
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
 * What a caller checks in the stored bytes before the file is ready, throwing a DomainError to refuse it: a logo's
 * pixels. The file stays pending, as for a mismatch, so nobody can list or download it.
 */
export type StoredBytesCheck = (body: Uint8Array, declaredType: string) => void | Promise<void>;

/**
 * Marks an upload ready once storage holds the promised file, and `check` passes on its bytes. Confirming twice is
 * harmless, which is what a client does when its retried PUT is answered 412: storage already holds the first upload.
 *
 * An upload stops counting toward the storage limit when its link lapses (`bytesStored`), so one confirmed after that
 * must fit again (`LIMIT_REACHED`/`STORAGE_LIMIT_REACHED`): else uploads sent and left until their links lapsed, then
 * confirmed after as many more, would pass the limit. Such confirms take turns, under a lock of the organization's
 * storage, so two can't both take the last room. One asked for over an hour ago is refused outright
 * (`NOT_FOUND`/`UPLOAD_EXPIRED`): the file is uploaded again.
 */
export async function confirmUpload(
  { db, storage, storageLimitBytes }: FilesDependencies,
  actor: Actor,
  input: AttachmentRefInput,
  check?: StoredBytesCheck,
): Promise<AttachmentSummary> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input));
  if (row.status === "ready") return summaryFor(actor, row);
  const askedSeconds = (Date.now() - row.createdAt.getTime()) / 1000;
  if (askedSeconds > CONFIRM_WITHIN_SECONDS) {
    throw new DomainError("NOT_FOUND", "UPLOAD_EXPIRED", "The upload was asked for too long ago");
  }
  const stored = await storage.head(storageKeyOf(row));
  if (!stored) throw new DomainError("NOT_FOUND", "UPLOAD_NOT_FOUND", "The file hasn't arrived in storage");
  if (stored.sizeBytes !== row.sizeBytes || stored.contentType !== row.contentType) {
    throw new DomainError("VALIDATION", "UPLOAD_DOES_NOT_MATCH", "The stored file isn't the one that was announced");
  }
  if (check) {
    const body = await storage.get(storageKeyOf(row));
    if (!body) throw new DomainError("NOT_FOUND", "UPLOAD_NOT_FOUND", "The file hasn't arrived in storage");
    await check(body, row.contentType);
  }
  const limit =
    askedSeconds > UPLOAD_URL_SECONDS && storageLimitBytes ? await storageLimitBytes(row.organizationId) : null;
  return db.forOrg(actor.organizationId, async (tx) => {
    if (limit !== null) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment-storage:${row.organizationId}`}, 0))`;
      // Read again under the lock: another confirm may have made it ready, or taken the room, meanwhile.
      const now = await findAttachment(tx, input);
      if (now.status === "pending" && (await bytesStored(tx, row.organizationId)) + now.sizeBytes > limit) {
        throw new DomainError("LIMIT_REACHED", "STORAGE_LIMIT_REACHED", "This organization's file storage is full");
      }
    }
    await tx.attachment.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "ready", confirmedAt: new Date() },
    });
    return summaryFor(actor, await findAttachment(tx, input));
  });
}
