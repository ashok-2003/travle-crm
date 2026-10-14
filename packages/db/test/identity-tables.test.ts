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

  it("skips row-level security only for Better Auth's member and invitation tables", () => {
    expect(signInTables).toEqual(["invitation", "member"]);
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

  it("lets a deleted role's key be used again, but never by two roles that are not deleted", async () => {
    const first = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides" } }));
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).rejects.toThrow(/Unique constraint/);
    await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: first.id }, data: { deletedAt: new Date(), deletedBy: first.id } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).resolves.toMatchObject({ key: "guides" });
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
