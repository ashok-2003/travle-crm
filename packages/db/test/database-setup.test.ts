// The database roles and the organization table behave as the spec requires (spec section 4).
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

  it("does not let the runtime role read migration history or create tables", async () => {
    await expect(queryAs(urls.runtime, 'SELECT * FROM "_prisma_migrations"')).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "CREATE TABLE sneaky (id int)")).rejects.toThrow(/permission denied/);
  });

  it("only accepts organization codes of 3-12 capital letters or digits", async () => {
    const platform = createPlatformClient(urls.platform);
    try {
      await expect(platform.organization.create({ data: { name: "Valid", code: "SHARMA1" } })).resolves.toMatchObject({
        code: "SHARMA1",
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
