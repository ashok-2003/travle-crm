// Fails when a key on an organization-owned table leaves out organization_id:
// - a foreign key without it lets a row point at another organization's row, because Postgres checks foreign keys
//   without row-level security;
// - a unique constraint without it tells one organization that another already uses a value;
// - with no foreign key from organization_id to organization, a row could name an organization that doesn't exist.
// The primary key on `id` alone is the exception: random UUIDs reveal nothing. It also fails when a key to organization
// cascades a deletion, or when a key from a table made after plan 2 cascades an update. Each check has a probe (run in
// a rolled-back migrator transaction) proving it fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { crossOrganizationUniques, signInTables } from "./org-table-fixtures.js";

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
      -- Only the key columns count: INCLUDE columns (after the first indnkeyatts) don't make the key per organization.
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = t.oid AND a.attnum = ANY ((x.indkey::int2[])[0:x.indnkeyatts - 1])
                        AND a.attname = 'organization_id')
      AND NOT (x.indisprimary AND x.indnatts = 1 AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = x.indkey[0] AND a.attname = 'id'))
    ORDER BY name`;
  return rows
    .filter((row) => !signInTables.includes(row.table_name))
    .map((row) => row.name)
    .filter((name) => !crossOrganizationUniques.some((unique) => name.endsWith(`.${unique}`)));
}

/** Tables with organization_id that have no foreign key from that column to organization. */
async function tablesWithoutOrganizationForeignKey(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint fk
        WHERE fk.contype = 'f' AND fk.conrelid = c.oid AND fk.confrelid = 'organization'::regclass
          AND fk.conkey = ARRAY[a.attnum])
    ORDER BY c.relname`;
  return rows.map((row) => row.table_name);
}

/**
 * Foreign keys to organization that cascade, or set null or a default, when an organization is deleted. Postgres runs
 * those actions as the table's owner, past row-level security and past a REVOKE such as audit_entry's.
 */
async function organizationForeignKeysThatDoNotRestrictDeletes(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ name: string }[]>`
    SELECT source.relname || '.' || fk.conname AS name
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace AND n.nspname = 'public'
    WHERE fk.contype = 'f' AND fk.confrelid = 'organization'::regclass AND fk.confdeltype <> 'r'
    ORDER BY name`;
  return rows.map((row) => row.name);
}

/**
 * The tables plans 1 and 2 made, whose keys kept Prisma's default ON UPDATE CASCADE. Every key since restricts updates
 * too (ON UPDATE RESTRICT): a cascade runs as the table's owner, past a REVOKE UPDATE such as outbox_event's.
 */
const tablesWithCascadingUpdates = [
  "account",
  "invitation",
  "member",
  "org_counter",
  "role",
  "role_permission",
  "session",
  "two_factor",
];

/** Foreign keys that don't restrict a change to the key they refer to, outside the tables plans 1 and 2 made. */
async function foreignKeysThatDoNotRestrictUpdates(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string; name: string }[]>`
    SELECT source.relname AS table_name, source.relname || '.' || fk.conname AS name
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace AND n.nspname = 'public'
    WHERE fk.contype = 'f' AND fk.confupdtype <> 'r'
    ORDER BY name`;
  return rows.filter((row) => !tablesWithCascadingUpdates.includes(row.table_name)).map((row) => row.name);
}

/** A table's foreign keys: what each refers to, and its delete and update actions (r restrict, c cascade, a none). */
async function foreignKeysOf(client: Queryable, table: string) {
  return client.$queryRaw<{ name: string; target: string; onDelete: string; onUpdate: string }[]>`
    SELECT fk.conname AS name, fk.confrelid::regclass::text AS target,
           fk.confdeltype::text AS "onDelete", fk.confupdtype::text AS "onUpdate"
    FROM pg_constraint fk
    WHERE fk.contype = 'f' AND fk.conrelid = ${table}::regclass
    ORDER BY fk.conname`;
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

  it("refer to the organization from every organization table", async () => {
    expect(await tablesWithoutOrganizationForeignKey(platform)).toEqual([]);
  });

  it("catches an organization table with no foreign key to organization", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE orphan_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL)`;
      expect(await tablesWithoutOrganizationForeignKey(tx)).toEqual(["orphan_probe"]);
      await tx.$executeRaw`ALTER TABLE orphan_probe ADD FOREIGN KEY (organization_id) REFERENCES organization (id)`;
      expect(await tablesWithoutOrganizationForeignKey(tx)).toEqual([]);
    });
  });

  it("refuse to delete an organization that still has rows, rather than cascade", async () => {
    expect(await organizationForeignKeysThatDoNotRestrictDeletes(platform)).toEqual([]);
  });

  it("refuse to change a key a row refers to, rather than cascade, on every table since plan 2", async () => {
    expect(await foreignKeysThatDoNotRestrictUpdates(platform)).toEqual([]);
  });

  it("catches a foreign key that cascades an update", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE update_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL
                             CONSTRAINT update_probe_organization REFERENCES organization (id)
                             ON DELETE RESTRICT ON UPDATE CASCADE)`;
      expect(await foreignKeysThatDoNotRestrictUpdates(tx)).toEqual(["update_probe.update_probe_organization"]);
      await tx.$executeRaw`ALTER TABLE update_probe DROP CONSTRAINT update_probe_organization,
                             ADD FOREIGN KEY (organization_id) REFERENCES organization (id)
                             ON DELETE RESTRICT ON UPDATE RESTRICT`;
      expect(await foreignKeysThatDoNotRestrictUpdates(tx)).toEqual([]);
    });
  });

  it("give audit_entry one foreign key, to organization, so no deletion elsewhere reaches the log", async () => {
    // Postgres runs a cascade as the table's owner, past the grants that keep the log append-only: a key from
    // actor_user_id or impersonated_by to user (whose keys cascade) would let deleting a user delete entries.
    expect(await foreignKeysOf(platform, "audit_entry")).toEqual([
      { name: "audit_entry_organization_id_fkey", target: "organization", onDelete: "r", onUpdate: "r" },
    ]);
  });

  it("lists every foreign key of a table, with its actions", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE audit_probe (organization_id uuid NOT NULL
                             CONSTRAINT audit_probe_organization REFERENCES organization (id) ON DELETE RESTRICT,
                             actor_user_id uuid CONSTRAINT audit_probe_actor REFERENCES "user" (id) ON DELETE CASCADE)`;
      expect(await foreignKeysOf(tx, "audit_probe")).toEqual([
        { name: "audit_probe_actor", target: '"user"', onDelete: "c", onUpdate: "a" },
        { name: "audit_probe_organization", target: "organization", onDelete: "r", onUpdate: "a" },
      ]);
    });
  });

  it("catches a foreign key to organization that cascades a deletion", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE cascade_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL
                             CONSTRAINT cascade_probe_organization REFERENCES organization (id) ON DELETE CASCADE)`;
      expect(await organizationForeignKeysThatDoNotRestrictDeletes(tx)).toEqual([
        "cascade_probe.cascade_probe_organization",
      ]);
      await tx.$executeRaw`ALTER TABLE cascade_probe DROP CONSTRAINT cascade_probe_organization,
                             ADD FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE RESTRICT`;
      expect(await organizationForeignKeysThatDoNotRestrictDeletes(tx)).toEqual([]);
    });
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
      // An INCLUDE column is stored in the index but not part of what must be unique.
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (code) INCLUDE (organization_id)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual(["unique_probe.unique_probe_code"]);
      await tx.$executeRaw`DROP INDEX unique_probe_code`;
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (organization_id, code)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual([]);
    });
  });
});
