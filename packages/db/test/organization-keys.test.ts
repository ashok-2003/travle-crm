// Fails when a key on an organization-owned table leaves out organization_id:
// - a foreign key without it lets a row point at another organization's row, because Postgres checks foreign keys
//   without row-level security;
// - a unique constraint without it tells one organization that another already uses a value.
// The primary key on `id` alone is the exception: random UUIDs reveal nothing. Each check has a probe (run in a
// rolled-back migrator transaction) proving it fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { signInTables } from "./org-table-fixtures.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Foreign keys from one organization table to another that do not pair organization_id with organization_id. */
async function foreignKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string; name: string }[]>`
    SELECT source.relname AS table_name, source.relname || '.' || fk.conname AS name
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace AND n.nspname = 'public'
    WHERE fk.contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.conrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.confrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(fk.conkey, fk.confkey) AS pair(source_column, target_column)
        JOIN pg_attribute s ON s.attrelid = fk.conrelid AND s.attnum = pair.source_column
        JOIN pg_attribute t ON t.attrelid = fk.confrelid AND t.attnum = pair.target_column
        WHERE s.attname = 'organization_id' AND t.attname = 'organization_id')
    ORDER BY name`;
  return rows.filter((row) => !signInTables.includes(row.table_name)).map((row) => row.name);
}

/** Unique indexes (including primary keys) on organization tables that leave out organization_id. */
async function uniqueKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string; name: string }[]>`
    SELECT t.relname AS table_name, t.relname || '.' || i.relname AS name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE x.indisunique
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = t.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = t.oid AND a.attnum = ANY (x.indkey::int2[]) AND a.attname = 'organization_id')
      AND NOT (x.indisprimary AND x.indnatts = 1 AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = x.indkey[0] AND a.attname = 'id'))
    ORDER BY name`;
  return rows.filter((row) => !signInTables.includes(row.table_name)).map((row) => row.name);
}

class Rollback extends Error {}

/** Runs setup SQL then assertions inside a migrator transaction that is always rolled back. */
async function probe(
  migratorUrl: string,
  run: (tx: Queryable & Pick<Prisma.TransactionClient, "$executeRaw">) => Promise<void>,
) {
  const migrator = createPrismaClient(migratorUrl, { max: 1 });
  try {
    await expect(
      migrator.$transaction(async (tx) => {
        await run(tx);
        throw new Rollback("undo the probe tables");
      }),
    ).rejects.toBeInstanceOf(Rollback);
  } finally {
    await migrator.$disconnect();
  }
}

describe("keys on organization tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("pair organization_id in every foreign key to another organization table", async () => {
    expect(await foreignKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("include organization_id in every unique constraint, except a primary key on id", async () => {
    expect(await uniqueKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("catches a foreign key that leaves organization_id out", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE fk_probe_parent (id uuid PRIMARY KEY, organization_id uuid NOT NULL,
                             UNIQUE (organization_id, id))`;
      await tx.$executeRaw`CREATE TABLE fk_probe_child (organization_id uuid NOT NULL,
                             parent_id uuid REFERENCES fk_probe_parent (id))`;
      expect(await foreignKeysWithoutOrganization(tx)).toEqual(["fk_probe_child.fk_probe_child_parent_id_fkey"]);
      await tx.$executeRaw`ALTER TABLE fk_probe_child DROP CONSTRAINT fk_probe_child_parent_id_fkey,
                             ADD FOREIGN KEY (organization_id, parent_id) REFERENCES fk_probe_parent (organization_id, id)`;
      expect(await foreignKeysWithoutOrganization(tx)).toEqual([]);
    });
  });

  it("catches a unique constraint that leaves organization_id out", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE unique_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL, code text)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual([]);
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (code)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual(["unique_probe.unique_probe_code"]);
      await tx.$executeRaw`DROP INDEX unique_probe_code`;
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (organization_id, code)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual([]);
    });
  });
});
