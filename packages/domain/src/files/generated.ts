// Files the server makes or downloads itself (a rendered PDF, a WhatsApp file), stored once: bytes the organization already
// keeps (a staff member's phone sending the same brochure again) become a file sharing the stored object, as a copy does.
import { createHash } from "node:crypto";
import { attachmentFileName, type AttachmentSummary } from "@travel-crm/contracts/files";
import { isUniqueViolation, withDeleted, type OrgTx } from "@travel-crm/db";
import { DomainError, type Actor } from "../kernel/index.js";
import { attachmentFields, type AttachmentRow, storageKeyOf, summaryFor } from "./attachment-row.js";
import type { FilesDependencies, GeneratedFile } from "./dependencies.js";
import { isShortLivedRecordType } from "./record-types.js";
import { assertTypeAllowed } from "./uploads.js";

/** The SHA-256 of a file's bytes, in hex: what finds the same bytes stored before. */
export function sha256Of(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Stores a file the server made, such as a rendered PDF, ready at once. The row is written first and marked ready
 * after the upload, so storage never holds a file no row accounts for; a failed upload leaves only a pending row,
 * which nobody can list or download. When the organization already stores the same bytes (same size and SHA-256, on a
 * live file holding its own), nothing is uploaded: the file shares that one's object and adds nothing to the storage
 * used. Short-lived files (an import's report, an export) are always stored apart, and so is a retry's pending row,
 * whose own key the failed try may already have filled (stored again there, it leaves no object nothing reads).
 *
 * Safe to retry: with a caller-chosen `attachmentId`, a file already stored under it for the same record is returned
 * as it is, and a pending one is completed. The same id on another record is refused.
 */
export async function storeGeneratedFile(
  dependencies: FilesDependencies,
  actor: Actor,
  file: GeneratedFile,
): Promise<AttachmentSummary> {
  const { db, storage } = dependencies;
  const name = attachmentFileName.safeParse(file.fileName);
  if (!name.success) throw new DomainError("VALIDATION", "INVALID_FILE_NAME", "The file name can't be used");
  assertTypeAllowed(file.recordType, file.contentType);
  if (file.body.byteLength === 0) throw new DomainError("VALIDATION", "EMPTY_FILE", "The file is empty");
  const { row, created } = await rowFor(dependencies, actor, { ...file, fileName: name.data });
  // Someone else's earlier run already finished it: show what that caller may see, not what the retry sent.
  if (row.status === "ready") return summaryFor(actor, row);
  // A retry may carry a different body than the failed first run left announced: keep the row true to what is stored.
  const stored = {
    status: "ready",
    confirmedAt: new Date(),
    sizeBytes: file.body.byteLength,
    contentType: file.contentType,
  };
  const contentSha256 = isShortLivedRecordType(file.recordType) ? null : sha256Of(file.body);
  if (contentSha256 !== null && created) {
    const shared = await db.forOrg(actor.organizationId, async (tx) => {
      const storedAsId = await sameBytesHolder(tx, row, file.body.byteLength, contentSha256);
      if (storedAsId === null) return null;
      return tx.attachment.update({ where: { id: row.id }, data: { ...stored, storedAsId }, select: attachmentFields });
    });
    if (shared !== null) return summaryFor(actor, shared);
  }
  await storage.put({ key: storageKeyOf(row), contentType: file.contentType, body: file.body });
  return db.forOrg(actor.organizationId, async (tx) =>
    summaryFor(
      actor,
      await tx.attachment.update({
        where: { id: row.id },
        // Null too if a racing retry made it a sharing file meanwhile: it holds these bytes now.
        data: { ...stored, contentSha256, storedAsId: null },
        select: attachmentFields,
      }),
    ),
  );
}

/**
 * The live file of the organization that holds these bytes itself, the oldest, other than `row`. Read under a share
 * lock, so a deletion handing its bytes on, or the clean-up pointing it elsewhere, finishes first, and a file it no
 * longer fits is not chosen.
 */
async function sameBytesHolder(
  tx: OrgTx,
  row: AttachmentRow,
  sizeBytes: number,
  contentSha256: string,
): Promise<string | null> {
  const [holder] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM attachment
    WHERE organization_id = ${row.organizationId}::uuid AND content_sha256 = ${contentSha256}
      AND size_bytes = ${sizeBytes} AND status = 'ready' AND stored_as_id IS NULL AND deleted_at IS NULL
      AND id <> ${row.id}::uuid
    ORDER BY created_at, id
    LIMIT 1
    FOR SHARE`;
  return holder?.id ?? null;
}

/**
 * The row to store the file under: a new one (`created`), or, with a chosen id, the one an earlier try made for the same
 * record.
 */
async function rowFor(
  { db }: FilesDependencies,
  actor: Actor,
  file: GeneratedFile,
): Promise<{ row: AttachmentRow; created: boolean }> {
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
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.body.byteLength,
          sensitive: file.sensitive ?? false,
          createdBy: actor.userId,
        },
        select: attachmentFields,
      }),
    );
  if (file.attachmentId === undefined) return { row: await create(), created: true };
  const existing = await existingRow();
  if (existing) return { row: existing, created: false };
  try {
    return { row: await create(), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another run created it first, or the id is another organization's (which this one can't see).
    const raced = await existingRow();
    if (!raced) throw inUse();
    return { row: raced, created: false };
  }
}
