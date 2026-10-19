// The console's hourly sweep of imports (B53, D31), in a platform transaction across organizations: an import a week
// past its last change has its file and report deleted for good and its kept values emptied, and is marked expired;
// a file stored late under an import already expired (a job's write after an erasure) goes too. A batch at a time.
import type { OrgTx } from "@travel-crm/db";
import { IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE } from "../files/index.js";
import { deleteImportFiles, emptyKeptValues } from "./withdraw.js";

/** What a sweep's batch did: how many imports or late files it handled, and in which organizations. */
export interface SweptOrganizations {
  swept: number;
  organizationIds: string[];
}

export async function sweepExpiredImports(tx: OrgTx, now: Date, limit: number): Promise<SweptOrganizations> {
  // Skips an import a job holds (an add under way): the next hour's sweep takes it.
  const due = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
    SELECT id, organization_id AS "organizationId"
    FROM import_batch
    WHERE keep_until < ${now} AND status <> 'expired'
    ORDER BY keep_until
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED`;
  const late = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
    SELECT DISTINCT b.id, b.organization_id AS "organizationId"
    FROM attachment a
    JOIN import_batch b ON b.organization_id = a.organization_id AND b.id = a.record_id
    WHERE a.record_type IN (${IMPORT_FILE_RECORD_TYPE}, ${IMPORT_REPORT_RECORD_TYPE}) AND b.status = 'expired'
    LIMIT ${limit}`;
  const byOrganization = new Map<string, { due: string[]; late: string[] }>();
  for (const [list, rows] of [
    ["due", due],
    ["late", late],
  ] as const) {
    for (const row of rows) {
      const entry = byOrganization.get(row.organizationId) ?? { due: [], late: [] };
      entry[list].push(row.id);
      byOrganization.set(row.organizationId, entry);
    }
  }
  for (const [organizationId, imports] of byOrganization) {
    await deleteImportFiles(tx, organizationId, [...imports.due, ...imports.late], now);
    if (imports.due.length === 0) continue;
    await emptyKeptValues(tx, organizationId, imports.due);
    await tx.importBatch.updateMany({
      where: { organizationId, id: { in: imports.due } },
      data: { status: "expired" },
    });
  }
  return { swept: due.length + late.length, organizationIds: [...byOrganization.keys()] };
}
