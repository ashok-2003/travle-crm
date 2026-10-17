// Proves, for every organization-owned table, that another organization can't read, change, delete or receive its rows.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { softDeleteModels } from "../src/soft-delete.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { orgTableFixtures, signInTables } from "./org-table-fixtures.js";

const softDeleteTables = softDeleteModels.map((model) =>
  model.replaceAll(/[A-Z]/g, (letter, index: number) => (index ? "_" : "") + letter.toLowerCase()),
);

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

async function tablesWithOrganizationId(platform: PlatformClient): Promise<string[]> {
  const rows = await platform.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  return rows.map((row) => row.table_name).filter((name) => !signInTables.includes(name));
}

/** The columns app_runtime may UPDATE, by table, as the grants say (table-wide or column by column). */
async function runtimeUpdatableColumns(platform: PlatformClient, tables: string[]): Promise<Map<string, string[]>> {
  const rows = await platform.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${tables}::text[])
      AND has_column_privilege('app_runtime', format('public.%I', table_name), column_name, 'UPDATE')
    ORDER BY table_name, column_name`;
  const columns = new Map<string, string[]>();
  for (const row of rows) columns.set(row.table_name, [...(columns.get(row.table_name) ?? []), row.column_name]);
  return columns;
}

describe("organization isolation", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    orgA = await createTestOrganization(platform, "Isolation A");
    orgB = await createTestOrganization(platform, "Isolation B");
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("has an isolation fixture for every table with an organization_id column", async () => {
    expect(await tablesWithOrganizationId(platform)).toEqual(Object.keys(orgTableFixtures).sort());
  });

  it("checks updates with a column the runtime role may update, whenever the grants let it update any", async () => {
    // Read from the grants, so a table given UPDATE on a few columns can't be tested on organization_id alone (which
    // the role then can't update at all), leaving those columns untested under row-level security.
    const granted = await runtimeUpdatableColumns(platform, Object.keys(orgTableFixtures));
    const problems = Object.entries(orgTableFixtures).flatMap(([tableName, fixture]) => {
      const columns = granted.get(tableName) ?? [];
      if (columns.length === 0) {
        return fixture.appendOnly === true && fixture.updatableColumn === undefined
          ? []
          : [`${tableName}: app_runtime may update no column, so its fixture is appendOnly with no updatableColumn`];
      }
      const checked = fixture.updatableColumn ?? "organization_id";
      return columns.includes(checked)
        ? []
        : [`${tableName}: the update check uses ${checked}, but app_runtime may update only ${columns.join(", ")}`];
    });
    expect(problems).toEqual([]);
  });

  describe.each(Object.keys(orgTableFixtures))("table %s", (tableName) => {
    const table = Prisma.raw(quoteIdentifier(tableName));
    const countRows = (orgId: string): Promise<number | undefined> =>
      db.forOrg(
        orgId,
        async (tx) => (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${table}`)[0]?.n,
      );

    const fixture = orgTableFixtures[tableName];
    const appendOnly = fixture?.appendOnly === true;
    // organization_id itself can't be updated on these tables (column-level grants), which is stronger than row-level
    // security: the update check then uses a column the runtime role may update.
    const organizationIdLocked = appendOnly || fixture?.updatableColumn !== undefined;

    beforeAll(async () => {
      if (fixture?.createAsPlatform) {
        const { createAsPlatform } = fixture;
        await platformDb.transaction((tx) => createAsPlatform(tx, orgA));
      } else if (fixture?.create) {
        await db.forOrg(orgA, fixture.create);
      } else {
        throw new Error(`No fixture for ${tableName}`);
      }
    });

    it("is invisible to another organization", async () => {
      expect(await countRows(orgB)).toBe(0);
    });

    it("cannot be updated by another organization", async () => {
      const column = Prisma.raw(quoteIdentifier(fixture?.updatableColumn ?? "organization_id"));
      const updateAsOtherOrganization = db.forOrg(
        orgB,
        (tx) => tx.$executeRaw`UPDATE ${table} SET ${column} = ${column}`,
      );
      // An append-only table with no updatable column named gives app_runtime no UPDATE on organization_id at all.
      if (appendOnly && fixture.updatableColumn === undefined) {
        await expect(updateAsOtherOrganization).rejects.toThrow(/permission denied/i);
      } else {
        expect(await updateAsOtherOrganization).toBe(0);
      }
    });

    it("cannot be deleted by another organization", async () => {
      // Soft-delete, append-only and undeletable tables give app_runtime no DELETE grant at all (ADR 0004), which is
      // stronger than row-level security. The lists are fixed, not read from the grants, so a mistaken REVOKE on an
      // ordinary table still fails here.
      const deleteAsOtherOrganization = db.forOrg(orgB, (tx) => tx.$executeRaw`DELETE FROM ${table}`);
      if (softDeleteTables.includes(tableName) || appendOnly || fixture?.undeletable === true) {
        await expect(deleteAsOtherOrganization).rejects.toThrow(/permission denied/i);
      } else {
        expect(await deleteAsOtherOrganization).toBe(0);
      }
      expect(await countRows(orgA)).toBeGreaterThan(0);
    });

    it("cannot be moved into another organization", async () => {
      await expect(
        db.forOrg(orgA, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = ${orgB}::uuid`),
      ).rejects.toThrow(organizationIdLocked ? /permission denied/i : /row-level security/);
    });

    it("is invisible when no organization is set", async () => {
      const runtime = createPrismaClient(urls.runtime, { max: 1 });
      try {
        const rows = await runtime.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${table}`;
        expect(rows[0]?.n).toBe(0);
      } finally {
        await runtime.$disconnect();
      }
    });
  });
});
