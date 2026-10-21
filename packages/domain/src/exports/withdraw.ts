// Withdrawing an organization's export files (B54, B55, D31, D32), in a platform transaction: the erasure's for every
// export at once, the sweep's for those past their 24 hours. Each query names the organization, since the platform
// role sees them all. The files go for good through the deletions' outbox, and no export keeps a search.
import { type OrgTx, withDeleted } from "@travel-crm/db";
import { DATA_EXPORT_RECORD_TYPE, deleteRecordFiles } from "../files/index.js";

/**
 * Deletes for good every file stored under these exports (their ids to them emptied first, the key being RESTRICT),
 * marks those still making or ready expired, and empties any search their filter kept. Returns how many files went.
 */
export async function expireExports(
  tx: OrgTx,
  organizationId: string,
  exportIds: readonly string[],
  now: Date,
): Promise<number> {
  if (exportIds.length === 0) return 0;
  await tx.dataExport.updateMany({
    where: { organizationId, id: { in: [...exportIds] } },
    data: { fileAttachmentId: null },
  });
  await tx.$executeRaw`
    UPDATE data_export
    SET status = CASE WHEN status IN ('making', 'ready') THEN 'expired' ELSE status END,
      filter = CASE WHEN filter ? 'search' THEN jsonb_set(filter, '{search}', 'null'::jsonb) ELSE filter END
    WHERE organization_id = ${organizationId}::uuid AND id = ANY(${[...exportIds]}::uuid[])`;
  let files = 0;
  for (const recordId of exportIds) {
    files += await deleteRecordFiles(tx, { organizationId, recordType: DATA_EXPORT_RECORD_TYPE, recordId }, now);
  }
  return files;
}

/**
 * An erasure's step (B55, spec 9): every export file of the organization deleted for good, and every export still
 * making or ready marked expired (a job meeting it stops quietly, D32). Returns how many exports it expired and files
 * it deleted.
 */
export async function withdrawExportFiles(
  tx: OrgTx,
  organizationId: string,
  now: Date,
): Promise<{ exports: number; files: number }> {
  const kept = await tx.dataExport.findMany({
    where: { organizationId, status: { in: ["making", "ready"] } },
    select: { id: true },
  });
  const stored = await withDeleted(() =>
    tx.attachment.findMany({
      where: { organizationId, recordType: DATA_EXPORT_RECORD_TYPE },
      select: { recordId: true },
      distinct: ["recordId"],
    }),
  );
  const ids = [...new Set([...kept.map((row) => row.id), ...stored.map((file) => file.recordId)])];
  const files = await expireExports(tx, organizationId, ids, now);
  return { exports: kept.length, files };
}
