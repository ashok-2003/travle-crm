// Rules the identity tables enforce themselves: role key and scope formats, key reuse after a soft delete,
// one organization per user, the sign-in table list, and which organization columns the api may change.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { signInTables } from "./org-table-fixtures.js";

describe("identity tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Identity tables");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("exempts from row-level security only Better Auth tables that exist and carry organization_id", async () => {
    // The only Better Auth tables with organization_id. A typo or a stale entry must not exempt some other table.
    const betterAuthTablesWithOrganizationId = ["invitation", "member"];
    expect(signInTables.filter((table) => !betterAuthTablesWithOrganizationId.includes(table))).toEqual([]);
    expect(new Set(signInTables).size).toBe(signInTables.length);
    for (const table of signInTables) {
      const [column] = await platform.$queryRaw<{ found: number }[]>`
        SELECT count(*)::int AS found FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'organization_id'`;
      expect(column?.found, `${table} must exist and have an organization_id column`).toBe(1);
    }
  });

  it("only accepts role keys of lowercase letters, digits and hyphens that start with a letter", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "senior-sales-2", name: "Senior sales" } })),
    ).resolves.toMatchObject({ key: "senior-sales-2" });
    for (const badKey of ["Sales", "2nd-shift", "sales manager", "s", "a".repeat(49)]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: badKey, name: "Bad" } })),
      ).rejects.toThrow(/role_key_format/);
    }
  });

  it("only accepts own, all or no scope on a permission", async () => {
    const role = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "scoped", name: "Scoped" } }));
    await db.forOrg(organizationId, (tx) =>
      tx.rolePermission.createMany({
        data: [
          { roleId: role.id, permission: "leads:view", scope: "own" },
          { roleId: role.id, permission: "quotes:view", scope: "all" },
          { roleId: role.id, permission: "leads:create", scope: null },
        ],
      }),
    );
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.rolePermission.create({ data: { roleId: role.id, permission: "bookings:view", scope: "team" } }),
      ),
    ).rejects.toThrow(/role_permission_scope_value/);
  });

  it("never reuses a role key, even after the role is deleted", async () => {
    // member.role holds the key with no foreign key, so a reused key would hand a new role to old members.
    const first = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides" } }));
    await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: first.id }, data: { deletedAt: new Date(), deletedBy: first.id } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).rejects.toThrow(/Unique constraint/);
  });

  it("lets a deleted role's name be used again, but never by two roles that are not deleted", async () => {
    const first = await db.forOrg(organizationId, (tx) =>
      tx.role.create({ data: { key: "drivers-1", name: "Drivers" } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "drivers-2", name: "Drivers" } })),
    ).rejects.toThrow(/Unique constraint/);
    await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: first.id }, data: { deletedAt: new Date(), deletedBy: first.id } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "drivers-2", name: "Drivers" } })),
    ).resolves.toMatchObject({ name: "Drivers" });
  });

  it("refuses a permission row that names another organization's role", async () => {
    // The composite foreign key (organization_id, role_id) → role (organization_id, id): a row created in
    // organization B can only point at B's roles, even though foreign keys are checked without row-level security.
    const otherOrganizationId = await createTestOrganization(platform, "Identity tables, other roles");
    const role = await db.forOrg(organizationId, (tx) =>
      tx.role.create({ data: { key: "planners", name: "Planners" } }),
    );
    await expect(
      db.forOrg(otherOrganizationId, (tx) =>
        tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:create" } }),
      ),
    ).rejects.toThrow(/role_permission_organization_id_role_id_fkey|Foreign key constraint/);
  });

  it("keeps each user in at most one organization", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Identity tables, second");
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      const user = await runtime.user.create({ data: { name: "Ravi", email: `ravi-${organizationId}@example.test` } });
      await runtime.member.create({ data: { userId: user.id, organizationId, role: "sales" } });
      await expect(
        runtime.member.create({ data: { userId: user.id, organizationId: otherOrganizationId, role: "sales" } }),
      ).rejects.toThrow(/Unique constraint/);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("lets the api change require_two_factor, but not an organization's name or sign-in code", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { requireTwoFactor: true } }),
      ).resolves.toMatchObject({ requireTwoFactor: true });
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { name: "Renamed" } }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { code: "HIJACK1" } }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await runtime.$disconnect();
    }
  });
});
