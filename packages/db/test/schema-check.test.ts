// Fails when a table with organization_id is missing forced row-level security or either policy,
// so a new table can't quietly skip protection. Includes a probe proving the check itself works.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { signInTables } from "./org-table-fixtures.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

interface TableProtection {
  table_name: string;
  rls: boolean;
  forced: boolean;
  policies: string[];
}

async function protectionOfOrgTables(client: Queryable): Promise<TableProtection[]> {
  return client.$queryRaw<TableProtection[]>`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           COALESCE(array_agg(p.policyname::text ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}') AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
    WHERE c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname`;
}

function unprotected(tables: TableProtection[]): string[] {
  return tables
    .filter((t) => !signInTables.includes(t.table_name))
    .filter(
      (t) => !t.rls || !t.forced || !t.policies.includes("org_isolation") || !t.policies.includes("platform_access"),
    )
    .map((t) => t.table_name);
}

class Rollback extends Error {}

describe("row-level security schema check", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("protects every table that has an organization_id column", async () => {
    const tables = await protectionOfOrgTables(platform);
    expect(tables.length).toBeGreaterThan(0);
    expect(unprotected(tables)).toEqual([]);
  });

  it("limits org_isolation to the runtime role", async () => {
    const rows = await platform.$queryRaw<{ roles: string[] }[]>`
      SELECT DISTINCT roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public' AND policyname = 'org_isolation'`;
    expect(rows).toEqual([{ roles: ["app_runtime"] }]);
  });

  it("catches a table that forgot its policies", async () => {
    const migrator = createPrismaClient(urls.migrator, { max: 1 });
    try {
      await expect(
        migrator.$transaction(async (tx) => {
          await tx.$executeRaw`CREATE TABLE unprotected_probe (organization_id uuid NOT NULL)`;
          expect(unprotected(await protectionOfOrgTables(tx))).toContain("unprotected_probe");
          throw new Rollback("undo the probe table");
        }),
      ).rejects.toBeInstanceOf(Rollback);
    } finally {
      await migrator.$disconnect();
    }
  });
});
