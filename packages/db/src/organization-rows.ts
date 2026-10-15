// An organization's rows in every table that carries organization_id, for the platform's purge and export (spec 5).
// The tables come from the database's own catalog, so a module's new table is covered without a list to keep up.
// Only @travel-crm/db/platform exports these.
import type { DatabaseClient } from "./client.js";
import { assertOrganizationId, type TransactionClient } from "./for-org.js";

/** The raw-SQL methods with SQL as a string: table names come from the catalog, never from a caller. */
type RawStrings = Pick<DatabaseClient, "$executeRawUnsafe" | "$queryRawUnsafe">;

const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * The tables with organization_id, each after every table that refers to it, so deleting in this order never trips
 * a foreign key. audit_entry comes first: its key to organization restricts deletes (ADR 0015).
 */
async function tablesInDeleteOrder(tx: TransactionClient): Promise<string[]> {
  const tables = (
    await tx.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p') AND c.relname <> 'organization'
      ORDER BY c.relname`
  ).map((row) => row.name);
  const references = await tx.$queryRaw<{ child: string; parent: string }[]>`
    SELECT DISTINCT child.relname AS child, parent.relname AS parent
    FROM pg_constraint k
    JOIN pg_class child ON child.oid = k.conrelid
    JOIN pg_class parent ON parent.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
    WHERE k.contype = 'f' AND child.oid <> parent.oid`;
  const ordered = ["audit_entry"].filter((name) => tables.includes(name));
  const remaining = tables.filter((name) => !ordered.includes(name));
  while (remaining.length > 0) {
    // A table may go once no remaining table refers to it.
    const next = remaining.find(
      (table) =>
        !references.some((ref) => ref.parent === table && ref.child !== table && remaining.includes(ref.child)),
    );
    if (next === undefined) throw new Error(`Foreign keys between ${remaining.join(", ")} form a cycle`);
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
}

/**
 * Deletes every row of the organization, in every table that has organization_id (Better Auth's member and
 * invitation included), then the organization itself, in a platform transaction. Returns how many rows went from each
 * table. The organization's users have no organization_id: identity deletes them (`deleteUsers`).
 */
export async function deleteOrganizationRows(
  tx: TransactionClient,
  organizationId: string,
): Promise<Record<string, number>> {
  assertOrganizationId(organizationId);
  const raw = tx as unknown as RawStrings;
  const deleted: Record<string, number> = {};
  for (const table of await tablesInDeleteOrder(tx)) {
    deleted[table] = await raw.$executeRawUnsafe(
      `DELETE FROM ${quoted(table)} WHERE organization_id = $1::uuid`,
      organizationId,
    );
  }
  deleted.organization = await raw.$executeRawUnsafe(`DELETE FROM organization WHERE id = $1::uuid`, organizationId);
  return deleted;
}

/**
 * Every row of the organization as JSON, by table, and the organization's own row: an export's data. Tables listed in
 * `except` (internal ones such as the outbox) are left out.
 */
export async function organizationRows(
  tx: TransactionClient,
  organizationId: string,
  options: { except?: readonly string[] } = {},
): Promise<Record<string, unknown[]>> {
  assertOrganizationId(organizationId);
  const raw = tx as unknown as RawStrings;
  const tables = ["organization", ...(await tablesInDeleteOrder(tx)).sort()].filter(
    (table) => !(options.except ?? []).includes(table),
  );
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const column = table === "organization" ? "id" : "organization_id";
    const found = await raw.$queryRawUnsafe<{ row: unknown }[]>(
      `SELECT row_to_json(t) AS row FROM ${quoted(table)} t WHERE ${column} = $1::uuid`,
      organizationId,
    );
    rows[table] = found.map((entry) => entry.row);
  }
  return rows;
}
