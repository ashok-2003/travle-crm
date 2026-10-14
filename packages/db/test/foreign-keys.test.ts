// Fails when a foreign key between two organization-owned tables leaves out organization_id. Such a key would let a
// row point at another organization's row, because Postgres checks foreign keys without row-level security.
// Includes a probe (run in a rolled-back migrator transaction) proving the check fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Foreign keys from one organization table to another that do not pair organization_id with organization_id. */
async function foreignKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ name: string }[]>`
    SELECT source.relname || '.' || fk.conname AS name
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
  return rows.map((row) => row.name);
}

class Rollback extends Error {}

describe("foreign keys between organization tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("always include organization_id", async () => {
    expect(await foreignKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("catches a foreign key that leaves organization_id out", async () => {
    const migrator = createPrismaClient(urls.migrator, { max: 1 });
    try {
      await expect(
        migrator.$transaction(async (tx) => {
          await tx.$executeRaw`CREATE TABLE fk_probe_parent (id uuid PRIMARY KEY, organization_id uuid NOT NULL,
                                 UNIQUE (organization_id, id))`;
          await tx.$executeRaw`CREATE TABLE fk_probe_child (organization_id uuid NOT NULL,
                                 parent_id uuid REFERENCES fk_probe_parent (id))`;
          expect(await foreignKeysWithoutOrganization(tx)).toEqual(["fk_probe_child.fk_probe_child_parent_id_fkey"]);
          await tx.$executeRaw`ALTER TABLE fk_probe_child DROP CONSTRAINT fk_probe_child_parent_id_fkey,
                                 ADD FOREIGN KEY (organization_id, parent_id) REFERENCES fk_probe_parent (organization_id, id)`;
          expect(await foreignKeysWithoutOrganization(tx)).toEqual([]);
          throw new Rollback("undo the probe tables");
        }),
      ).rejects.toBeInstanceOf(Rollback);
    } finally {
      await migrator.$disconnect();
    }
  });
});
