// sheets_key_check holds one keyed hash of a constant, for every process to compare (SC8): one row at most, of 32 bytes,
// read and inserted by the runtime role, never changed or deleted by it, and not reachable by the platform role or from an
// organization's transaction. It has no organization_id, so no row-level security.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { sheetsKeyChecks } from "../src/sheets-key-check.js";

describe("the sheets hash key's check row", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("has no organization_id, and exactly the columns it should", async () => {
    // The catalog, not information_schema, which shows the platform role only what it may use.
    const columns = await platform.$queryRaw<{ column_name: string }[]>`
      SELECT attname AS column_name FROM pg_attribute
      WHERE attrelid = 'public.sheets_key_check'::regclass AND attnum > 0 AND NOT attisdropped
      ORDER BY attname`;
    expect(columns.map((column) => column.column_name)).toEqual(["check_value", "created_at", "id", "singleton"]);
  });

  it("keeps one row at most, of 32 bytes, however many processes try to write it", async () => {
    const first = new Uint8Array(randomBytes(32));
    const second = new Uint8Array(randomBytes(32));
    await db.withoutOrg((tx) =>
      sheetsKeyChecks(tx).createMany({ data: [{ checkValue: first }, { checkValue: second }], skipDuplicates: true }),
    );
    await db.withoutOrg((tx) =>
      sheetsKeyChecks(tx).createMany({ data: [{ checkValue: second }], skipDuplicates: true }),
    );
    const rows = await db.withoutOrg((tx) => sheetsKeyChecks(tx).findMany());
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]?.checkValue ?? []).equals(Buffer.from(first))).toBe(true);
    await expect(
      db.withoutOrg((tx) => sheetsKeyChecks(tx).create({ data: { checkValue: new Uint8Array(31) } })),
    ).rejects.toThrow();
    await expect(
      db.withoutOrg((tx) => sheetsKeyChecks(tx).create({ data: { singleton: false, checkValue: first } })),
    ).rejects.toThrow(/sheets_key_check_singleton/);
  });

  it("lets the runtime role select and insert only, and the platform role nothing", async () => {
    const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const held = async (role: string) => {
      const found = await Promise.all(
        privileges.map(async (privilege) => {
          const [row] = await platform.$queryRaw<{ held: boolean }[]>`
            SELECT has_table_privilege(${role}, 'public.sheets_key_check', ${privilege}) AS held`;
          return row?.held === true ? privilege : null;
        }),
      );
      return found.filter((privilege) => privilege !== null).sort();
    };
    expect(await held("app_runtime")).toEqual(["INSERT", "SELECT"]);
    expect(await held("app_platform")).toEqual([]);
  });
});
