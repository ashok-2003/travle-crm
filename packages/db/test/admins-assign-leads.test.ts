// Release 1's data migration (R16): every organization's Admin role (org-admin) gets leads:assign, once, whatever
// else it holds; no other role gets it, and a deleted Admin role stays as it was. The test runs the migration's own
// SQL again, twice, on Admin roles made after it ran.
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const migration = path.join(
  import.meta.dirname,
  "../prisma/migrations/20261017110000_admins_assign_leads/migration.sql",
);

describe("leads:assign for existing Admin roles", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  async function runMigrationAsMigrator(): Promise<void> {
    const migrator = new pg.Client({ connectionString: urls.migrator });
    await migrator.connect();
    try {
      await migrator.query(await readFile(migration, "utf8"));
    } finally {
      await migrator.end();
    }
  }

  const permissionsOf = async (roleId: string) =>
    (await platform.rolePermission.findMany({ where: { roleId }, orderBy: { permission: "asc" } })).map(
      (grant) => `${grant.permission}:${grant.scope ?? "-"}`,
    );

  it("gives an organization's Admin role leads:assign once, and no other role", async () => {
    const organizationId = await createTestOrganization(platform, "Existing admins");
    const admin = await platform.role.create({ data: { organizationId, key: "org-admin", name: "Admin" } });
    await platform.rolePermission.create({ data: { organizationId, roleId: admin.id, permission: "leads:edit" } });
    const sales = await platform.role.create({ data: { organizationId, key: "sales", name: "Sales" } });
    const otherOrganization = await createTestOrganization(platform, "Deleted admin");
    const deletedAdmin = await platform.role.create({
      data: { organizationId: otherOrganization, key: "org-admin", name: "Admin", deletedAt: new Date() },
    });

    await runMigrationAsMigrator();
    await runMigrationAsMigrator();

    expect(await permissionsOf(admin.id)).toEqual(["leads:assign:-", "leads:edit:-"]);
    expect(await permissionsOf(sales.id)).toEqual([]);
    expect(await permissionsOf(deletedAdmin.id)).toEqual([]);
  });
});
