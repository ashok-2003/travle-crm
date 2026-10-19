// The console's hourly sweep of exports (B54, D31, M1, M6), across organizations: an export 24 hours past ready has
// its file deleted for good and is marked expired; so does one still making a day after it was asked for (its job
// gave up); and a file stored late under an export already expired or failed goes too. The sweep lists a page of
// them, each case on its own index, then sweeps each in its own short transaction.
import { type OrgTx, sql } from "@travel-crm/db";
import { DATA_EXPORT_RECORD_TYPE } from "../files/index.js";
import type { SweepItem } from "../imports/index.js";
import { EXPORT_KEPT_MS } from "./export-runner.js";
import { expireExports } from "./withdraw.js";

/** The next exports to sweep, leaving out those this run already visited. */
export async function exportsToSweep(
  tx: OrgTx,
  now: Date,
  limit: number,
  visited: readonly string[],
): Promise<SweepItem[]> {
  const abandoned = new Date(now.getTime() - EXPORT_KEPT_MS);
  const unvisited = sql`NOT (e.id = ANY(${[...visited]}::uuid[]))`;
  // On data_export_due: its predicate written out, so the planner sees the index serves it.
  const ready = await tx.$queryRaw<SweepItem[]>`
    SELECT e.id, e.organization_id AS "organizationId"
    FROM data_export e
    WHERE e.status <> 'expired' AND e.status = 'ready' AND e.expires_at < ${now} AND ${unvisited}
    ORDER BY e.expires_at
    LIMIT ${limit}`;
  // On data_export_making.
  const stuck = await tx.$queryRaw<SweepItem[]>`
    SELECT e.id, e.organization_id AS "organizationId"
    FROM data_export e
    WHERE e.status = 'making' AND e.created_at < ${abandoned} AND ${unvisited}
    ORDER BY e.created_at
    LIMIT ${limit}`;
  const late = await tx.$queryRaw<SweepItem[]>`
    SELECT DISTINCT e.id, e.organization_id AS "organizationId"
    FROM attachment a
    JOIN data_export e ON e.organization_id = a.organization_id AND e.id = a.record_id
    WHERE a.record_type = ${DATA_EXPORT_RECORD_TYPE} AND e.status IN ('expired', 'failed') AND ${unvisited}
    LIMIT ${limit}`;
  return [...ready, ...stuck, ...late];
}

/**
 * Sweeps one export, held for the transaction: deletes its file and, when its time is up, marks it expired. An export
 * its job holds is skipped (SKIP LOCKED) for the next hour, as is one not yet due. Returns whether it swept.
 */
export async function sweepExport(tx: OrgTx, item: SweepItem, now: Date): Promise<boolean> {
  const abandoned = new Date(now.getTime() - EXPORT_KEPT_MS);
  const [row] = await tx.$queryRaw<{ status: string; expiresAt: Date | null; createdAt: Date }[]>`
    SELECT status, expires_at AS "expiresAt", created_at AS "createdAt"
    FROM data_export
    WHERE organization_id = ${item.organizationId}::uuid AND id = ${item.id}::uuid
    FOR NO KEY UPDATE SKIP LOCKED`;
  if (row === undefined) return false;
  const due =
    (row.status === "ready" && row.expiresAt !== null && row.expiresAt < now) ||
    (row.status === "making" && row.createdAt < abandoned) ||
    row.status === "expired" ||
    row.status === "failed";
  if (!due) return false;
  await expireExports(tx, item.organizationId, [item.id], now);
  return true;
}
