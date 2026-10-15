// The audit log's part in permanent deletion and the platform dashboard (spec 5, 7.4): one record's entries for an
// export, their redaction on erasure, and how many changes an organization made in a month.
import type { AuditEntry } from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";
import { listAuditEntries } from "./list-audit-entries.js";

/** One record whose entries an erasure redacts, e.g. a member or a traveller. */
export interface AuditedRecord {
  organizationId: string;
  entityType: string;
  entityId: string;
}

/** What a redacted side of an entry says: there was state, and it was erased. */
const REDACTED = { redacted: true };

/** Every entry about the record, newest first, in the transaction's organization: for the export before an erasure. */
export async function auditEntriesAbout(tx: OrgTx, record: AuditedRecord): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];
  let before: string | undefined;
  do {
    const page = await listAuditEntries(tx, {
      entityType: record.entityType,
      entityId: record.entityId,
      limit: 100,
      ...(before ? { before } : {}),
    });
    entries.push(...page.entries);
    before = page.nextCursor ?? undefined;
  } while (before);
  return entries;
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

/** Changes the transaction's organization recorded since `since`: a usage counter for the platform dashboard. */
export async function auditEntriesSince(tx: OrgTx, since: Date): Promise<number> {
  return tx.auditEntry.count({ where: { occurredAt: { gte: since } } });
}
