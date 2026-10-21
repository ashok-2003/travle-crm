// Fails when a table with organization_id is missing forced row-level security or has anything other than the two
// standard policies, and when a view or SECURITY DEFINER function could bypass them. Each check has a probe
// (run in a rolled-back migrator transaction) proving the check itself fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { IdentityTx } from "../src/for-org.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { signInTables, unscopedScheduleTables } from "./org-table-fixtures.js";

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
    WHERE c.relkind IN ('r', 'p')
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname`;
}

function unprotected(tables: TableProtection[]): string[] {
  return tables
    .filter((t) => !signInTables.includes(t.table_name) && !unscopedScheduleTables.includes(t.table_name))
    .filter((t) => !t.rls || !t.forced || t.policies.join(",") !== "org_isolation,platform_access")
    .map((t) => t.table_name);
}

/** Views that run with their owner's rights, which skips row-level security for the viewer. */
async function unsafeViews(client: Queryable, schema = "public"): Promise<string[]> {
  const rows = await client.$queryRaw<{ name: string }[]>`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = ${schema}
    WHERE (c.relkind = 'v' AND NOT COALESCE('security_invoker=true' = ANY (c.reloptions), false))
       OR c.relkind = 'm'
    ORDER BY c.relname`;
  return rows.map((row) => row.name);
}

/**
 * Functions allowed to run with their owner's rights, which skips row-level security, by exact signature (an overload
 * with other argument types is not allowed). Each one is reviewed and has its own test proving what it reveals.
 */
const allowedSecurityDefinerFunctions: string[] = [
  // The outbox relay's list of organizations with events waiting: organization ids only (ADR 0010,
  // outbox-relay-function.test.ts).
  "app_organizations_with_unrelayed_events(integer)",
];

/**
 * SECURITY DEFINER functions outside the allow-list, and allowed ones that don't set their own search_path (without it
 * a caller could shadow the tables and operators the function uses).
 */
async function securityDefinerFunctions(client: Queryable, schema = "public"): Promise<string[]> {
  const rows = await client.$queryRaw<{ signature: string; has_search_path: boolean }[]>`
    SELECT p.oid::regprocedure::text AS signature,
           EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS setting WHERE setting LIKE 'search_path=%') AS has_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = ${schema}
    WHERE p.prosecdef
    ORDER BY 1`;
  return rows.flatMap((row) => {
    if (!allowedSecurityDefinerFunctions.includes(row.signature)) return [row.signature];
    return row.has_search_path ? [] : [`${row.signature} has no search_path`];
  });
}

/** Whether the runtime role may create objects in a schema: it must not in the one pg-boss lives in. */
async function runtimeCanCreateIn(client: Queryable, schema: string): Promise<boolean> {
  const [row] = await client.$queryRaw<{ allowed: boolean }[]>`
    SELECT has_schema_privilege('app_runtime', ${schema}, 'CREATE') AS allowed`;
  return row?.allowed ?? false;
}

class Rollback extends Error {}

/** Runs setup SQL then assertions inside a migrator transaction that is always rolled back. */
async function probe(migratorUrl: string, run: (tx: IdentityTx) => Promise<void>): Promise<void> {
  const migrator = createPrismaClient(migratorUrl, { max: 1 });
  try {
    await expect(
      migrator.$transaction(async (tx) => {
        await run(tx);
        throw new Rollback("undo the probe");
      }),
    ).rejects.toBeInstanceOf(Rollback);
  } finally {
    await migrator.$disconnect();
  }
}

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

  it("has no views that bypass row-level security and no materialized views", async () => {
    expect(await unsafeViews(platform)).toEqual([]);
  });

  it("has no SECURITY DEFINER functions outside the allow-list", async () => {
    expect(await securityDefinerFunctions(platform)).toEqual([]);
  });

  it("catches a table that forgot its policies", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE unprotected_probe (organization_id uuid NOT NULL)`;
      expect(unprotected(await protectionOfOrgTables(tx))).toContain("unprotected_probe");
    });
  });

  it("catches a protected table with an extra permissive policy", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE extra_policy_probe (organization_id uuid NOT NULL)`;
      await tx.$executeRaw`SELECT app_enable_org_rls('extra_policy_probe')`;
      expect(unprotected(await protectionOfOrgTables(tx))).not.toContain("extra_policy_probe");
      await tx.$executeRaw`CREATE POLICY let_everyone_in ON extra_policy_probe USING (true)`;
      expect(unprotected(await protectionOfOrgTables(tx))).toContain("extra_policy_probe");
    });
  });

  it("catches a partitioned table that forgot its policies", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE partitioned_probe (organization_id uuid NOT NULL) PARTITION BY HASH (organization_id)`;
      expect(unprotected(await protectionOfOrgTables(tx))).toContain("partitioned_probe");
    });
  });

  it("catches a view that runs with its owner's rights", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE VIEW leaky_view_probe AS SELECT * FROM org_counter`;
      expect(await unsafeViews(tx)).toContain("leaky_view_probe");
      await tx.$executeRaw`ALTER VIEW leaky_view_probe SET (security_invoker = true)`;
      expect(await unsafeViews(tx)).not.toContain("leaky_view_probe");
      await tx.$executeRaw`CREATE MATERIALIZED VIEW materialized_probe AS SELECT * FROM org_counter`;
      expect(await unsafeViews(tx)).toContain("materialized_probe");
    });
  });

  it("catches a SECURITY DEFINER function", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE FUNCTION definer_probe() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS 'SELECT 1'`;
      expect(await securityDefinerFunctions(tx)).toContain("definer_probe()");
    });
  });

  it("allows a SECURITY DEFINER function by its exact signature, so an overload is caught", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`
        CREATE FUNCTION app_organizations_with_unrelayed_events(text) RETURNS SETOF uuid
        LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT organization_id FROM outbox_event'`;
      expect(await securityDefinerFunctions(tx)).toEqual(["app_organizations_with_unrelayed_events(text)"]);
    });
  });

  it("requires every SECURITY DEFINER function to set its search_path", async () => {
    await probe(urls.migrator, async (tx) => {
      // As if a later CREATE OR REPLACE had dropped the SET clause.
      await tx.$executeRaw`
        CREATE OR REPLACE FUNCTION app_organizations_with_unrelayed_events(max_organizations integer)
        RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
        AS 'SELECT organization_id FROM outbox_event WHERE relayed_at IS NULL GROUP BY organization_id LIMIT max_organizations'`;
      expect(await securityDefinerFunctions(tx)).toEqual([
        "app_organizations_with_unrelayed_events(integer) has no search_path",
      ]);
    });
  });

  it("has nothing in the pgboss schema that bypasses row-level security, and the runtime role can't create there", async () => {
    expect(await unsafeViews(platform, "pgboss")).toEqual([]);
    expect(await securityDefinerFunctions(platform, "pgboss")).toEqual([]);
    expect(await runtimeCanCreateIn(platform, "pgboss")).toBe(false);
  });

  it("catches an unsafe view, a SECURITY DEFINER function and a CREATE grant in the pgboss schema", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE VIEW pgboss.leaky_probe AS SELECT * FROM pgboss.version`;
      await tx.$executeRaw`CREATE FUNCTION pgboss.definer_probe() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = pgboss AS 'SELECT 1'`;
      await tx.$executeRaw`GRANT CREATE ON SCHEMA pgboss TO app_runtime`;
      expect(await unsafeViews(tx, "pgboss")).toEqual(["leaky_probe"]);
      expect(await securityDefinerFunctions(tx, "pgboss")).toEqual(["pgboss.definer_probe()"]);
      expect(await runtimeCanCreateIn(tx, "pgboss")).toBe(true);
    });
  });
});
