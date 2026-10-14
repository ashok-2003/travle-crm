// Proves, for every organization-owned table, that another organization can't read, change, delete or receive its rows.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { softDeleteModels } from "../src/soft-delete.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
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

describe("organization isolation", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    orgA = await createTestOrganization(platform, "Isolation A");
    orgB = await createTestOrganization(platform, "Isolation B");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("has an isolation fixture for every table with an organization_id column", async () => {
    expect(await tablesWithOrganizationId(platform)).toEqual(Object.keys(orgTableFixtures).sort());
  });

  describe.each(Object.keys(orgTableFixtures))("table %s", (tableName) => {
    const table = Prisma.raw(quoteIdentifier(tableName));
    const countRows = (orgId: string): Promise<number | undefined> =>
      db.forOrg(
        orgId,
        async (tx) => (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${table}`)[0]?.n,
      );

    beforeAll(async () => {
      const createRow = orgTableFixtures[tableName];
      if (!createRow) throw new Error(`No fixture for ${tableName}`);
      await db.forOrg(orgA, createRow);
    });

    it("is invisible to another organization", async () => {
      expect(await countRows(orgB)).toBe(0);
    });

    it("cannot be updated by another organization", async () => {
      expect(await db.forOrg(orgB, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = organization_id`)).toBe(
        0,
      );
    });

    it("cannot be deleted by another organization", async () => {
      // Soft-delete tables give app_runtime no DELETE grant at all (ADR 0004), which is stronger than row-level security.
      // The list is fixed, not read from the grants, so a mistaken REVOKE on an ordinary table still fails here.
      const deleteAsOtherOrganization = db.forOrg(orgB, (tx) => tx.$executeRaw`DELETE FROM ${table}`);
      if (softDeleteTables.includes(tableName)) {
        await expect(deleteAsOtherOrganization).rejects.toThrow(/permission denied/i);
      } else {
        expect(await deleteAsOtherOrganization).toBe(0);
      }
      expect(await countRows(orgA)).toBeGreaterThan(0);
    });

    it("cannot be moved into another organization", async () => {
      await expect(
        db.forOrg(orgA, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = ${orgB}::uuid`),
      ).rejects.toThrow(/row-level security/);
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
