// The audit log's part in permanent deletion and the platform dashboard (spec 5, 7.4): one record's entries for an
// export, their redaction on erasure, and how many changes an organization made in a month.
import { auditSource, type AuditEntry } from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";

/** One record whose entries an erasure redacts, e.g. a member or a traveller. */
export interface AuditedRecord {
  organizationId: string;
  entityType: string;
  entityId: string;
}

/** What a redacted side of an entry says: there was state, and it was erased. */
const REDACTED = { redacted: true };

/**
 * Every entry about the record, newest first, for the export before an erasure. Filtered by the record's
 * organization, so even a platform transaction, which sees every organization, gets that organization's alone.
 */
export async function auditEntriesAbout(tx: OrgTx, record: AuditedRecord): Promise<AuditEntry[]> {
  const rows = await tx.auditEntry.findMany({
    where: { organizationId: record.organizationId, entityType: record.entityType, entityId: record.entityId },
    // Entries written in one transaction share its time; the id (UUID v7) orders them and makes the order total.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorUserId: row.actorUserId,
    // The table's check allows only the contract's sources, and its snapshot checks only objects or NULL.
    source: auditSource.parse(row.source),
    impersonatedBy: row.impersonatedBy,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: snapshotOf(row.before),
    after: snapshotOf(row.after),
  }));
}

function snapshotOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}

/**
 * Replaces the before and after of every entry about the record with `{ "redacted": true }`, keeping who did what and
 * when (ADR 0015: the only change the platform role may make to an entry). Entries about other records name people by
 * id only, so they need nothing. Returns how many entries had state to redact.
 */
export async function redactAuditEntries(tx: OrgTx, record: AuditedRecord): Promise<number> {
  const redacted = JSON.stringify(REDACTED);
  return tx.$executeRaw`
    UPDATE audit_entry
    SET before = CASE WHEN before IS NULL THEN NULL ELSE ${redacted}::jsonb END,
        after = CASE WHEN after IS NULL THEN NULL ELSE ${redacted}::jsonb END
    WHERE organization_id = ${record.organizationId}::uuid
      AND entity_type = ${record.entityType} AND entity_id = ${record.entityId}::uuid
      AND (before <> ${redacted}::jsonb OR after <> ${redacted}::jsonb)`;
}

/**
 * Changes the transaction's organization recorded since `since`: a usage counter for the platform dashboard, which
 * counts each organization inside asOrganization. Row-level security is what limits it to one organization, so it
 * refuses to run as the platform role, which sees them all.
 */
export async function auditEntriesSince(tx: OrgTx, since: Date): Promise<number> {
  const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
  if (session?.role !== "app_runtime") {
    throw new RangeError("Count an organization's changes inside it (forOrg or asOrganization)");
  }
  return tx.auditEntry.count({ where: { occurredAt: { gte: since } } });
}
