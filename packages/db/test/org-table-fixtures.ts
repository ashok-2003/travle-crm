// Every organization-owned table's isolation fixture, gathered from the files in org-table-fixtures/: one file per
// module, so modules built at the same time never edit the same file. isolation.test.ts runs its checks on each
// table and fails if a table with an organization_id column has no fixture. Add a file, or an entry to your
// module's file, whenever you add such a table.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OrgTableFixture, OrgTableFixtures } from "./org-table-fixture.js";

export type { OrgTableFixture, OrgTableFixtures } from "./org-table-fixture.js";

const directory = path.join(import.meta.dirname, "org-table-fixtures");

async function loadFixtures(): Promise<OrgTableFixtures> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts")).sort();
  const merged: Record<string, OrgTableFixture> = {};
  for (const file of files) {
    const loaded = (await import(pathToFileURL(path.join(directory, file)).href)) as { fixtures?: OrgTableFixtures };
    if (!loaded.fixtures) throw new Error(`org-table-fixtures/${file} must export \`fixtures\``);
    for (const [table, fixture] of Object.entries(loaded.fixtures)) {
      if (table in merged) throw new Error(`Two isolation fixtures for table ${table}`);
      merged[table] = fixture;
    }
  }
  return merged;
}

export const orgTableFixtures = await loadFixtures();

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4): Better Auth's member and invitation. Only the identity module may touch
 * them. identity-tables.test.ts checks each entry exists and is one of those two, so no other table can be exempted.
 */
export const signInTables: readonly string[] = ["invitation", "member"];

/**
 * Tables that carry organization_id but stay outside row-level security, because the Sheets sync's worker must find due
 * sheets of every organization without entering one, and a spreadsheet's claim must be unique across organizations
 * (ADR 0031) and the Meta lead ads' Page route, which finds a Page's agency from its webhook and must be unique across
 * agencies (ADR 0034) and the WhatsApp number route, which finds an agency from MSG91's number (ADR 0035). They hold ids, times and a keyed hash only: no organization data. Reached only through
 * @travel-crm/db/sheet-schedule (the Page route through @travel-crm/db/meta-routes, the number route through @travel-crm/db/whatsapp-routes) inside db.withoutOrg(). schedule-table.test.ts checks each entry exists, has no
 * row-level security and holds exactly the columns it should, so no other table can be exempted by this list.
 */
export const unscopedScheduleTables: readonly string[] = [
  "sheet_check_schedule",
  "sheet_spreadsheet_claim",
  "meta_page_route",
  "whatsapp_number_route",
];

/**
 * Unique indexes that leave out organization_id on purpose, because uniqueness across organizations is their point and
 * row-level security would hide it: the spreadsheet claim's hash (S4) the Page route's Page (M4) and the WhatsApp number route's number (ADR 0035). Only tables of unscopedScheduleTables may have one.
 */
export const crossOrganizationUniques: readonly string[] = [
  "sheet_spreadsheet_claim_hash",
  "meta_page_route_page",
  "whatsapp_number_route_pkey",
  "whatsapp_number_route_connection",
];
