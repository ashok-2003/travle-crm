// The database roles and the organization table behave as the spec requires (spec section 4).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { createPlatformClient } from "../src/platform.js";

async function queryAs<Row extends pg.QueryResultRow>(
  url: string,
  sql: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<Row>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

describe("database setup", () => {
  const urls = inject("dbUrls");

  it("creates the three application roles, none of which can bypass row-level security", async () => {
    const roles = await queryAs<{ rolname: string; rolbypassrls: boolean }>(
      urls.superuser,
      "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname",
      [["app_migrator", "app_platform", "app_runtime"]],
    );
    expect(roles).toEqual([
      { rolname: "app_migrator", rolbypassrls: false },
      { rolname: "app_platform", rolbypassrls: false },
      { rolname: "app_runtime", rolbypassrls: false },
    ]);
  });

  it("lets the platform role switch to the runtime role without inheriting its rights, and no role the reverse", async () => {
    const memberships = await queryAs<{ role: string; member: string; inherits: boolean; switches: boolean }>(
      urls.superuser,
      `SELECT r.rolname AS role, m.rolname AS member, a.inherit_option AS inherits, a.set_option AS switches
       FROM pg_auth_members a
       JOIN pg_roles r ON r.oid = a.roleid
       JOIN pg_roles m ON m.oid = a.member
       WHERE r.rolname LIKE 'app\\_%' OR m.rolname LIKE 'app\\_%'`,
    );
    expect(memberships).toEqual([{ role: "app_runtime", member: "app_platform", inherits: false, switches: true }]);
    await expect(queryAs(urls.runtime, "SET ROLE app_platform")).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "SET ROLE app_migrator")).rejects.toThrow(/permission denied/);
  });

  it("does not let the runtime role read migration history or create tables", async () => {
    await expect(queryAs(urls.runtime, 'SELECT * FROM "_prisma_migrations"')).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "CREATE TABLE sneaky (id int)")).rejects.toThrow(/permission denied/);
  });

  it("does not let the runtime role create temporary tables, which outlive a transaction on a pooled connection", async () => {
    await expect(queryAs(urls.runtime, "CREATE TEMP TABLE sneaky_temp (id int)")).rejects.toThrow(/permission denied/);
  });

  it("does not let the runtime role create or delete organizations", async () => {
    // Organizations are created and deleted only by the platform console.
    await expect(
      queryAs(
        urls.runtime,
        `INSERT INTO organization (id, name, code, updated_at) VALUES (gen_random_uuid(), 'Sneaky', 'SNEAKY1', now())`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "DELETE FROM organization")).rejects.toThrow(/permission denied/);
  });

  it("only accepts organization codes of 3-12 capital letters or digits", async () => {
    const platform = createPlatformClient(urls.platform);
    // Random, so a rerun against the same database (watch mode) doesn't hit the unique index.
    const validCode = `V${randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase()}`;
    try {
      await expect(platform.organization.create({ data: { name: "Valid", code: validCode } })).resolves.toMatchObject({
        code: validCode,
      });
      for (const badCode of ["SH", "sharma", "SHARMA-HOLIDAYS", "THIRTEENCHARS"]) {
        await expect(platform.organization.create({ data: { name: "Invalid", code: badCode } })).rejects.toThrow(
          /organization_code_format|check constraint/,
        );
      }
    } finally {
      await platform.$disconnect();
    }
  });
});
