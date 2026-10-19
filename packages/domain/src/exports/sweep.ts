// The console's hourly sweep of exports (B54, D31), in a platform transaction across organizations: an export 24 hours
// past ready has its file deleted for good and is marked expired; so does one still making a day after it was asked
// for (its job gave up); and a file stored late under an export already expired goes too. A batch at a time.
import type { OrgTx } from "@travel-crm/db";
import { DATA_EXPORT_RECORD_TYPE } from "../files/index.js";
import { EXPORT_KEPT_MS } from "./export-runner.js";
import { expireExports } from "./withdraw.js";

/** What a sweep's batch did: how many exports or late files it handled, and in which organizations. */
export interface SweptExports {
  swept: number;
  organizationIds: string[];
}

export async function sweepExpiredExports(tx: OrgTx, now: Date, limit: number): Promise<SweptExports> {
  const abandoned = new Date(now.getTime() - EXPORT_KEPT_MS);
  // Skips an export its job holds: the next hour's sweep takes it.
  const due = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
    SELECT id, organization_id AS "organizationId"
    FROM data_export
    WHERE (status = 'ready' AND expires_at < ${now}) OR (status = 'making' AND created_at < ${abandoned})
    ORDER BY id
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED`;
  const late = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
    SELECT DISTINCT e.id, e.organization_id AS "organizationId"
    FROM attachment a
    JOIN data_export e ON e.organization_id = a.organization_id AND e.id = a.record_id
    WHERE a.record_type = ${DATA_EXPORT_RECORD_TYPE} AND e.status IN ('expired', 'failed')
    LIMIT ${limit}`;
  const byOrganization = new Map<string, string[]>();
  for (const row of [...due, ...late]) {
    byOrganization.set(row.organizationId, [...(byOrganization.get(row.organizationId) ?? []), row.id]);
  }
  for (const [organizationId, ids] of byOrganization) await expireExports(tx, organizationId, ids, now);
  return { swept: due.length + late.length, organizationIds: [...byOrganization.keys()] };
}
