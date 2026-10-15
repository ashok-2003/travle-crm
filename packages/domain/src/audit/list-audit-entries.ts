// Reads an organization's audit log, newest first, a page at a time. The API checks audit:view before calling it.
import {
  auditSource,
  type AuditEntry,
  type AuditEntryPage,
  type ListAuditEntriesInput,
} from "@travel-crm/contracts/audit";
import type { OrgTx } from "@travel-crm/db";

export async function listAuditEntries(tx: OrgTx, input: ListAuditEntriesInput): Promise<AuditEntryPage> {
  const rows = await tx.auditEntry.findMany({
    where: input.entityType && input.entityId ? { entityType: input.entityType, entityId: input.entityId } : {},
    // Entries written in one transaction share its time; the id (UUID v7) orders them and makes the order total.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
    // One more than the page, to know whether there is a next page.
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    entries: page.map(auditEntryOf),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** An audit_entry row as the log shows it: the module's one mapping, for the list and for an erasure's export. */
export function auditEntryOf(row: {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  source: string;
  impersonatedBy: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}): AuditEntry {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorUserId: row.actorUserId,
    source: sourceOf(row.source),
    impersonatedBy: row.impersonatedBy,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: snapshotOf(row.before),
    after: snapshotOf(row.after),
  };
}

/** The table's check allows only the contract's sources. */
function sourceOf(value: string): AuditEntry["source"] {
  const source = auditSource.safeParse(value);
  if (source.success) return source.data;
  throw new Error(`Unknown audit source ${JSON.stringify(value)}`);
}

/** The table's checks keep snapshots to JSON objects or NULL. */
function snapshotOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}
