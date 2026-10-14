// Organization-owned models must not reach the sign-in tables (which have no row-level security) through relations.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { SignInRelationError } from "../src/sign-in-guard.js";
import { createTestOrganization } from "./helpers.js";

describe("sign-in relation guard", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Sign-in guard");
    await db.forOrg(organizationId, async (tx) => {
      const role = await tx.role.create({ data: { key: "guarded", name: "Guarded" } });
      await tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
    });
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("rejects the include chain that reached password hashes", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.role.findMany({
          include: { organization: { include: { members: { include: { user: { include: { accounts: true } } } } } } },
        }),
      ),
    ).rejects.toBeInstanceOf(SignInRelationError);
  });

  it("rejects the same path nested under another model, and in select and where", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.rolePermission.findMany({ include: { role: { include: { organization: true } } } }),
      ),
    ).rejects.toBeInstanceOf(SignInRelationError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.findMany({ select: { organization: { select: { name: true } } } })),
    ).rejects.toBeInstanceOf(SignInRelationError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.findMany({ where: { organization: { name: "x" } } })),
    ).rejects.toBeInstanceOf(SignInRelationError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.orgCounter.findMany({ include: { organization: true } })),
    ).rejects.toBeInstanceOf(SignInRelationError);
  });

  it("rejects nested writes and ordering through the organization relation", async () => {
    const roleId = await db.forOrg(organizationId, async (tx) => (await tx.role.findFirstOrThrow()).id);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.role.update({
          where: { id: roleId },
          data: { organization: { update: { members: { deleteMany: {} } } } },
        }),
      ),
    ).rejects.toBeInstanceOf(SignInRelationError);
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.findMany({ orderBy: { organization: { name: "asc" } } })),
    ).rejects.toBeInstanceOf(SignInRelationError);
    const renamed = await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: roleId }, data: { name: "Renamed guard" } }),
    );
    expect(renamed.name).toBe("Renamed guard");
  });

  it("still allows relations between organization-owned models", async () => {
    const roles = await db.forOrg(organizationId, (tx) => tx.role.findMany({ include: { permissions: true } }));
    expect(roles[0]?.permissions).toHaveLength(1);
  });

  it("does not restrict the identity module, which starts from sign-in tables", async () => {
    const user = await identityDatabase.client.user.create({
      data: { name: "Guard", email: `guard-${organizationId}@example.test` },
    });
    await identityDatabase.client.member.create({ data: { userId: user.id, organizationId, role: "guarded" } });
    const member = await identityDatabase.client.member.findFirst({
      where: { organizationId },
      include: { user: true, organization: true },
    });
    expect(member?.organization.id).toBe(organizationId);
    expect(member?.user.id).toBe(user.id);
  });
});
