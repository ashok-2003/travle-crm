// Permanent deletion of files (spec 5): attachment rows and the bytes in storage, gone for good, for the platform's
// purge of an organization and its erasure of one record's files. Only the platform role may delete attachment rows;
// until then a removed file stays stored, and counts. The bytes can't go in the transaction, so the transaction queues
// them in the deletions' outbox (stored-file-deletions.ts), and they go once it commits.
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { DomainError } from "../kernel/index.js";
import { storageKeyOf } from "./attachment-row.js";
import { isShortLivedRecordType, isSystemOwnedRecordType } from "./record-types.js";

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
 * Where every file of the organization is stored, removed ones and unfinished uploads included: an export that copies
 * them. The keys are made from the rows (ids only), as for any file.
 */
export async function storedFileKeys(tx: OrgTx, organizationId: string): Promise<string[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where: { organizationId }, select: { organizationId: true, id: true } }),
  );
  return rows.map(storageKeyOf);
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
 */
export async function deleteRecordFiles(tx: OrgTx, record: FileRecord, now: Date): Promise<number> {
  if (isSystemOwnedRecordType(record.recordType) && !isShortLivedRecordType(record.recordType)) {
    throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "These files belong to their record and go only with it");
  }
  // A plain DELETE: soft delete refuses Prisma's, and only the platform role has the right to it here.
  const deleted = await tx.$queryRaw<{ id: string }[]>`
    DELETE FROM attachment
    WHERE organization_id = ${record.organizationId}::uuid
      AND record_type = ${record.recordType} AND record_id = ${record.recordId}::uuid
    RETURNING id`;
  await tx.storedFileDeletion.createMany({
    data: deleted.map((row) => ({ targetOrganizationId: record.organizationId, attachmentId: row.id, dueAt: now })),
  });
  return deleted.length;
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
          ? await storage.presignDownload({ key: storageKeyOf(row), fileName: row.fileName }, linkSeconds)
          : null,
    })),
  );
}
