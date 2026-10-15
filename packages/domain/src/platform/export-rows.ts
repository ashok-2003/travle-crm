// What an organization's export reads, a page at a time and each page in its own short transaction: every table that
// carries organization_id (found from the catalog, so a module's new table is covered), the organization's own row,
// and its people. Each page is read inside asOrganization, as app_runtime under row-level security.
import { asOrganization, type IdentityTx } from "@travel-crm/db/platform";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { personExport, type PersonExport } from "../identity/index.js";
import type { PlatformServices } from "./services.js";

/** Tables of the workings, not of the organization's data: the outbox, listeners' bookkeeping, browsers' push keys. */
const INTERNAL_TABLES: ReadonlySet<string> = new Set(["outbox_event", "processed_event", "push_subscription"]);

/** A table's row, as JSON. */
export type ExportedRow = Record<string, unknown>;

/** The organization's own table first, then every table with organization_id, by name, from the catalog. */
export async function tablesToExport(services: PlatformServices): Promise<string[]> {
  const rows = await services.platformDb.transaction(
    (tx) => tx.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
      ORDER BY c.relname`,
  );
  return ["organization", ...rows.map((row) => row.name).filter((name) => !INTERNAL_TABLES.has(name))];
}

/** One page of a table's rows in primary-key order, after `after` (the last row of the page before). */
async function rowsPage(orgTx: IdentityTx, table: string, after: ExportedRow | null, limit: number) {
  const found = await orgTx.$queryRaw<{ row: ExportedRow }[]>`
    SELECT page AS row FROM app_export_organization_rows(${table}, ${after === null ? null : JSON.stringify(after)}::jsonb,
      ${limit}::integer) AS page`;
  return found.map((entry) => entry.row);
}

/**
 * The next page of `table`, and for the member table each member's person (identity's export of their sign-in
 * names and addresses), in one transaction.
 */
export async function exportPage(
  services: PlatformServices,
  organizationId: string,
  page: { table: string; after: ExportedRow | null; limit: number },
): Promise<{ rows: ExportedRow[]; people: PersonExport[] }> {
  return services.platformDb.transaction((tx) =>
    asOrganization(tx, organizationId, async (orgTx) => {
      const rows = await rowsPage(orgTx, page.table, page.after, page.limit);
      const people: PersonExport[] = [];
      if (page.table === "member") {
        for (const { id } of rows) {
          // Our own fixed words, so the failed-jobs list keeps them.
          if (typeof id !== "string") throw ownMessage(new TypeError("A member row without its id"));
          people.push(await personExport(orgTx, organizationId, id));
        }
      }
      return { rows, people };
    }),
  );
}
