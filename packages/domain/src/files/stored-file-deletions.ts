// The deletions' outbox (ADR 0023): stored files a purge or an erasure has committed to deleting, kept by id until
// the bytes are gone, so a storage error or a restart after the commit can't leave a file stored with nothing to find
// it. The platform's job reads it, deletes each file, then its row, in platform transactions.
import type { OrgTx } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { isUuid } from "../kernel/index.js";
import { storageKeyOf } from "./attachment-row.js";

/** One queued deletion: an attachment's bytes, or everything in a purged organization's folder (`attachmentId` null). */
export interface StoredFileDeletion {
  id: string;
  organizationId: string;
  attachmentId: string | null;
  dueAt: Date;
}

/** Where every file of the organization is stored: `organizations/<id>/`. */
export function organizationFolder(organizationId: string): string {
  // A prefix delete removes everything under it: checked, so it can only ever be one organization's folder.
  if (!isUuid(organizationId)) throw new RangeError("A storage folder belongs to one organization: give its id");
  return `organizations/${organizationId}/`;
}

/**
 * The deletions due by `now`, oldest first, at most `limit`; only one organization's when it is given, and none of
 * `exceptIds` (those a run has already tried and storage refused).
 */
export async function dueFileDeletions(
  tx: OrgTx,
  options: { now: Date; limit: number; organizationId?: string; exceptIds?: readonly string[] },
): Promise<StoredFileDeletion[]> {
  const rows = await tx.storedFileDeletion.findMany({
    where: {
      dueAt: { lte: options.now },
      ...(options.organizationId === undefined ? {} : { targetOrganizationId: options.organizationId }),
      ...(options.exceptIds?.length ? { id: { notIn: [...options.exceptIds] } } : {}),
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: options.limit,
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.targetOrganizationId,
    attachmentId: row.attachmentId,
    dueAt: row.dueAt,
  }));
}

/** When the next of the organization's queued deletions (or anyone's) is due, or null with none left. */
export async function nextFileDeletionDue(tx: OrgTx, organizationId?: string): Promise<Date | null> {
  const next = await tx.storedFileDeletion.findFirst({
    where: organizationId === undefined ? {} : { targetOrganizationId: organizationId },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });
  return next?.dueAt ?? null;
}

/** Deletes the queued file, or the whole folder, from storage. Safe to repeat: storage answers success for nothing. */
export async function deleteQueuedFile(storage: ObjectStorage, deletion: StoredFileDeletion): Promise<void> {
  if (deletion.attachmentId === null) {
    await storage.deletePrefix(organizationFolder(deletion.organizationId));
  } else {
    await storage.delete(storageKeyOf({ organizationId: deletion.organizationId, id: deletion.attachmentId }));
  }
}

/** Forgets a deletion once its file is gone. Two runs may both get here: the second finds nothing to forget. */
export async function forgetFileDeletion(tx: OrgTx, id: string): Promise<void> {
  await tx.storedFileDeletion.deleteMany({ where: { id } });
}
