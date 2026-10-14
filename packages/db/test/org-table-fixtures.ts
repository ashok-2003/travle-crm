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
