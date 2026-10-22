// Fresh planner statistics for tests that read query plans: ANALYZE needs the tables' owner, the migrator.
import pg from "pg";
import type { DbUrls } from "./test-databases.js";

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Runs ANALYZE on these tables as the migrator, so the planner sees what a seed just wrote. With `vacuum`, VACUUM too,
 * which sets the visibility map an index-only scan needs (autovacuum does it in production).
 */
export async function analyzeTables(
  urls: DbUrls,
  tables: readonly string[],
  options: { vacuum?: boolean } = {},
): Promise<void> {
  const unknown = tables.filter((table) => !TABLE_NAME.test(table));
  if (unknown.length > 0) throw new RangeError(`Not table names: ${unknown.join(", ")}`);
  const migrator = new pg.Client({ connectionString: urls.migrator });
  await migrator.connect();
  try {
    await migrator.query(
      `${options.vacuum === true ? "VACUUM (ANALYZE)" : "ANALYZE"} ${tables.map((table) => `"${table}"`).join(", ")}`,
    );
  } finally {
    await migrator.end();
  }
}
