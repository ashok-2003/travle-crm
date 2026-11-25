// Permanent deletion of files (spec 5): attachment rows and the bytes in storage, gone for good, for the platform's
// purge of an organization and its erasure of one record's files. Only the platform role may delete attachment rows;
// until then a removed file stays stored, and counts. The bytes can't go in the transaction, so the transaction queues
// them in the deletions' outbox (stored-file-deletions.ts), and they go once it commits.
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { DomainError } from "../kernel/index.js";
import { bytesKeyOf, storageKeyOf } from "./attachment-row.js";
import { isShortLivedRecordType, isSystemOwnedRecordType } from "./record-types.js";
import { LINKS_LAPSED_MS } from "./stored-file-deletions.js";

/** One record whose files an erasure deletes, e.g. a traveller. */
export interface FileRecord {
  organizationId: string;
  recordType: string;
  recordId: string;
}

/** A file as an export lists it, with a link to download it while the link lasts. */
export interface ExportedFile {
  id: string;
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sensitive: boolean;
  /** Removed by its organization, and kept until a purge. */
  deleted: boolean;
  /** Null for a file whose upload never finished. */
  downloadUrl: string | null;
}

/**
 * Upload links handed out before a purge work for 10 minutes (uploads.ts), and a PDF render under way stores its file
 * within seconds: after this long, nothing more can arrive in a purged organization's folder.
 */
export const LATE_WRITES_MS = 15 * 60 * 1000;

/**
 * Every file of the organization, removed ones and unfinished uploads included, with where its bytes are read from: an
 * export that copies each one. A file sharing another's bytes is listed under its own id, with the holder's key. The
 * keys are made from the rows (ids only), as for any file.
 */
export async function storedFiles(tx: OrgTx, organizationId: string): Promise<{ attachmentId: string; key: string }[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where: { organizationId }, select: { organizationId: true, id: true, storedAsId: true } }),
  );
  return rows.map((row) => ({ attachmentId: row.id, key: bytesKeyOf(row) }));
}

/**
 * Queues the deletion of every file the organization stored, removed ones and unfinished uploads included, in the
 * purge's own transaction before its rows go: its whole storage folder, swept as soon as the purge commits and again
 * once anything sent late has arrived. Returns how many files its rows held, for the platform log. Also right on an
 * organization already purged: its folder is swept again.
 */
export async function queueOrganizationFileDeletion(tx: OrgTx, organizationId: string, now: Date): Promise<number> {
  const files = await withDeleted(() => tx.attachment.count({ where: { organizationId } }));
  await tx.storedFileDeletion.createMany({
    data: [now, new Date(now.getTime() + LATE_WRITES_MS)].map((dueAt) => ({
      targetOrganizationId: organizationId,
      attachmentId: null,
      dueAt,
    })),
  });
  return files;
}

/**
 * Deletes one record's attachment rows, removed ones included, and queues their bytes' deletion in the same
 * transaction, due at `now` (the caller's clock, which also decides what is due). Returns how many files went. A
 * system-owned record's files (an issued document's PDF) are refused: they go only with their record, in a purge. The
 * short-lived ones, an import's report and an export, are the exception: the sweep and erasure delete them (B53-B55).
 *
 * Each file behaves as if it held its own bytes: one sharing another's bytes goes alone (the outbox deletes a row's own
 * object, which it has none of), and a file whose bytes others still share hands them on first (`handOverBytes`).
 */
export async function deleteRecordFiles(
  tx: OrgTx,
  storage: ObjectStorage,
  record: FileRecord,
  now: Date,
): Promise<number> {
  if (isSystemOwnedRecordType(record.recordType) && !isShortLivedRecordType(record.recordType)) {
    throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "These files belong to their record and go only with it");
  }
  // Held for the step: a copy of one of them waits, then finds it gone (copies.ts reads its source under a share lock).
  const rows = await tx.$queryRaw<{ id: string; storedAsId: string | null }[]>`
    SELECT id, stored_as_id AS "storedAsId" FROM attachment
    WHERE organization_id = ${record.organizationId}::uuid
      AND record_type = ${record.recordType} AND record_id = ${record.recordId}::uuid
    FOR UPDATE`;
  // A holder that handed its bytes on is deleted once the links its sharers handed out (to its object) have lapsed.
  const handedOver = new Set<string>();
  for (const row of rows) {
    if (row.storedAsId === null && (await handOverBytes(tx, storage, record, row.id))) handedOver.add(row.id);
  }
  const later = new Date(now.getTime() + LINKS_LAPSED_MS);
  // A plain DELETE: soft delete refuses Prisma's, and only the platform role has the right to it here.
  const deleted = await tx.$queryRaw<{ id: string }[]>`
    DELETE FROM attachment
    WHERE organization_id = ${record.organizationId}::uuid
      AND record_type = ${record.recordType} AND record_id = ${record.recordId}::uuid
    RETURNING id`;
  await tx.storedFileDeletion.createMany({
    data: deleted.map((row) => ({
      targetOrganizationId: record.organizationId,
      attachmentId: row.id,
      dueAt: handedOver.has(row.id) ? later : now,
    })),
  });
  return deleted.length;
}

/**
 * Before a file goes whose bytes others share, one of those staying (the oldest of the files not on the same record)
 * takes them over: storage copies the object to its own key, it holds the bytes from then on, and the others staying
 * name it. Each copy so survives its source's deletion, as when every copy was stored apart; the old object goes after
 * the commit, through the outbox, so a rollback leaves at most a stray copy under the heir's own key, which its own
 * deletion removes. The heir is locked before the copy, so the outbox job, which holds a queued file's row while it
 * deletes its object, never deletes what the heir is given. A holder whose object storage has lost hands on nothing:
 * the files sharing it were unreadable already, and an erasure goes on. Returns whether it handed the bytes on.
 */
async function handOverBytes(
  tx: OrgTx,
  storage: ObjectStorage,
  record: FileRecord,
  holderId: string,
): Promise<boolean> {
  const { organizationId, recordType, recordId } = record;
  const staying = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM attachment
    WHERE organization_id = ${organizationId}::uuid AND stored_as_id = ${holderId}::uuid
      AND NOT (record_type = ${recordType} AND record_id = ${recordId}::uuid)
    ORDER BY created_at, id
    FOR UPDATE`;
  const heir = staying[0]?.id;
  if (heir === undefined) return false;
  // The clean-up (dedupe.ts) may have queued the heir's own object, a second copy it stopped needing: now it holds the
  // bytes, so it stays.
  await tx.storedFileDeletion.deleteMany({ where: { targetOrganizationId: organizationId, attachmentId: heir } });
  await storage.copy(storageKeyOf({ organizationId, id: holderId }), storageKeyOf({ organizationId, id: heir }));
  // It takes the holder's hash too, so the same bytes stored again still find them.
  await tx.$executeRaw`
    UPDATE attachment SET stored_as_id = NULL, content_sha256 = (
      SELECT content_sha256 FROM attachment WHERE organization_id = ${organizationId}::uuid AND id = ${holderId}::uuid
    )
    WHERE organization_id = ${organizationId}::uuid AND id = ${heir}::uuid`;
  await tx.$executeRaw`
    UPDATE attachment SET stored_as_id = ${heir}::uuid
    WHERE organization_id = ${organizationId}::uuid AND id = ANY(${staying.slice(1).map((row) => row.id)}::uuid[])`;
  return true;
}

/** The organization's files, or one record's, removed ones included, each with a download link for `linkSeconds`. */
export async function exportedFiles(
  tx: OrgTx,
  storage: ObjectStorage,
  where: { organizationId: string; recordType?: string; recordId?: string },
  linkSeconds: number,
): Promise<ExportedFile[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  );
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      recordType: row.recordType,
      recordId: row.recordId,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      sensitive: row.sensitive,
      deleted: row.deletedAt !== null,
      downloadUrl:
        row.status === "ready"
          ? await storage.presignDownload({ key: bytesKeyOf(row), fileName: row.fileName }, linkSeconds)
          : null,
    })),
  );
}
