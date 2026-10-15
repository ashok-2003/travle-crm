// Permanent deletion of files (spec 5): attachment rows and the bytes in storage, gone for good, for the platform's
// purge of an organization and its erasure of one record's files. Only the platform role may delete attachment rows;
// until then a removed file stays stored, and counts.
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { DomainError } from "../kernel/index.js";
import { isSystemOwnedRecordType, storageKeyOf } from "./attachment-row.js";

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
 * Where every file of the organization is stored, removed ones included: what a purge must delete from storage. Read
 * it in the purge's own transaction, before the rows go.
 */
export async function storedFileKeys(tx: OrgTx, organizationId: string): Promise<string[]> {
  const rows = await withDeleted(() =>
    tx.attachment.findMany({ where: { organizationId }, select: { organizationId: true, id: true } }),
  );
  return rows.map(storageKeyOf);
}

/**
 * Deletes one record's attachment rows, removed ones included, and returns where their bytes are stored, for
 * deleteStoredFiles once the transaction has committed. A system-owned record's files (an issued document's PDF) are
 * refused: they go only with their record, in a purge.
 */
export async function deleteRecordFiles(tx: OrgTx, record: FileRecord): Promise<string[]> {
  if (isSystemOwnedRecordType(record.recordType)) {
    throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "These files belong to their record and go only with it");
  }
  // A plain DELETE: soft delete refuses Prisma's, and only the platform role has the right to it here.
  const deleted = await tx.$queryRaw<{ organization_id: string; id: string }[]>`
    DELETE FROM attachment
    WHERE organization_id = ${record.organizationId}::uuid
      AND record_type = ${record.recordType} AND record_id = ${record.recordId}::uuid
    RETURNING organization_id, id`;
  return deleted.map((row) => storageKeyOf({ organizationId: row.organization_id, id: row.id }));
}

/** Deletes stored bytes by key. Safe to repeat: a key that holds nothing is fine. */
export async function deleteStoredFiles(storage: ObjectStorage, keys: readonly string[]): Promise<void> {
  for (const key of keys) await storage.delete(key);
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
