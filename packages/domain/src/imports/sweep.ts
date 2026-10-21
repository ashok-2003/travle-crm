// The console's hourly sweep of imports (B53, D31, M1), across organizations: an import a week past its last change
// has its file and report deleted for good and its kept values emptied, and is marked expired; a file stored late
// under an import already expired (a job's write after an erasure) goes too. The sweep lists a page of them, then
// sweeps each in its own short transaction, so one slow import never holds back the rest.
import { type OrgTx, sql } from "@travel-crm/db";
import { IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE } from "../files/index.js";
import { deleteImportFiles, emptyKeptValues } from "./withdraw.js";

/** An import or export a sweep has to visit. */
export interface SweepItem {
  id: string;
  organizationId: string;
}

/** The next imports to sweep, leaving out those this run already visited: past their week, or holding a late file. */
export async function importsToSweep(
  tx: OrgTx,
  now: Date,
  limit: number,
  visited: readonly string[],
): Promise<SweepItem[]> {
  const unvisited = sql`NOT (b.id = ANY(${[...visited]}::uuid[]))`;
  const due = await tx.$queryRaw<SweepItem[]>`
    SELECT b.id, b.organization_id AS "organizationId"
    FROM import_batch b
    WHERE b.keep_until < ${now} AND b.status <> 'expired' AND ${unvisited}
    ORDER BY b.keep_until
    LIMIT ${limit}`;
  const late = await tx.$queryRaw<SweepItem[]>`
    SELECT DISTINCT b.id, b.organization_id AS "organizationId"
    FROM attachment a
    JOIN import_batch b ON b.organization_id = a.organization_id AND b.id = a.record_id
    WHERE a.record_type IN (${IMPORT_FILE_RECORD_TYPE}, ${IMPORT_REPORT_RECORD_TYPE}) AND b.status = 'expired'
      AND ${unvisited}
    LIMIT ${limit}`;
  return [...due, ...late];
}

/**
 * Sweeps one import, held for the transaction: deletes its files, and when its week is up empties its kept values and
 * marks it expired. An import a job holds is skipped (SKIP LOCKED) for the next hour, as is one not yet due. Returns
 * whether it swept.
 */
export async function sweepImport(tx: OrgTx, item: SweepItem, now: Date): Promise<boolean> {
  const [batch] = await tx.$queryRaw<{ status: string; keepUntil: Date }[]>`
    SELECT status, keep_until AS "keepUntil"
    FROM import_batch
    WHERE organization_id = ${item.organizationId}::uuid AND id = ${item.id}::uuid
    FOR NO KEY UPDATE SKIP LOCKED`;
  if (batch === undefined) return false;
  const due = batch.status !== "expired" && batch.keepUntil < now;
  if (!due && batch.status !== "expired") return false;
  await deleteImportFiles(tx, item.organizationId, [item.id], now);
  if (due) {
    await emptyKeptValues(tx, item.organizationId, [item.id]);
    await tx.importBatch.updateMany({
      where: { organizationId: item.organizationId, id: item.id },
      data: { status: "expired" },
    });
  }
  return true;
}
