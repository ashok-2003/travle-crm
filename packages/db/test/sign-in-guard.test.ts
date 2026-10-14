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
    // Through another organization-owned model's relation: the guard follows relations, not just the top level.
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.rolePermission.update({
          where: { organizationId_roleId_permission: { organizationId, roleId, permission: "leads:view" } },
          data: { role: { update: { organization: { update: { members: { deleteMany: {} } } } } } },
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

  describe("every argument of every operation", () => {
    let upsertOrganizationId: string;
    let memberId: string;

    beforeAll(async () => {
      // Its own organization and member, so a guard that let the write through would change nothing the others read.
      upsertOrganizationId = await createTestOrganization(platform, "Sign-in guard, upsert");
      const user = await identityDatabase.client.user.create({
        data: { name: "Upsert", email: `upsert-${upsertOrganizationId}@example.test` },
      });
      memberId = (
        await identityDatabase.client.member.create({
          data: { userId: user.id, organizationId: upsertOrganizationId, role: "sales" },
        })
      ).id;
    });

    const counterKey = (key: string) => ({ organizationId_key: { organizationId: upsertOrganizationId, key } });

    it("refuses upsert's update reaching members through the organization, before any SQL runs", async () => {
      const counters = await db.forOrg(upsertOrganizationId, async (tx) => {
        await expect(
          tx.orgCounter.upsert({
            where: counterKey("PROBE"),
            create: { key: "PROBE", value: 1 },
            update: {
              organization: { update: { members: { updateMany: { where: {}, data: { role: "org-owner" } } } } },
            },
          }),
        ).rejects.toBeInstanceOf(SignInRelationError);
        // A statement that failed in Postgres would have aborted the transaction; this one still answers.
        return tx.orgCounter.count();
      });
      expect(counters).toBe(0);
      const member = await identityDatabase.client.member.findUniqueOrThrow({ where: { id: memberId } });
      expect(member.role).toBe("sales");
    });

    it("refuses upsert's create connecting the organization", async () => {
      await expect(
        db.forOrg(upsertOrganizationId, (tx) =>
          tx.orgCounter.upsert({
            where: counterKey("PROBE"),
            create: { key: "PROBE", value: 1, organization: { connect: { id: upsertOrganizationId } } },
            update: {},
          }),
        ),
      ).rejects.toBeInstanceOf(SignInRelationError);
    });

    it("still refuses create and createMany reaching the organization through data", async () => {
      await expect(
        db.forOrg(upsertOrganizationId, (tx) =>
          tx.orgCounter.create({
            data: { key: "PROBE", value: 1, organization: { connect: { id: upsertOrganizationId } } },
          }),
        ),
      ).rejects.toBeInstanceOf(SignInRelationError);
      // createMany rows take no relations; passed as a variable they skip TypeScript's excess-property check, and the
      // guard refuses them before Prisma would.
      const rows = [{ key: "PROBE", value: 1, organization: { connect: { id: upsertOrganizationId } } }];
      await expect(
        db.forOrg(upsertOrganizationId, (tx) => tx.orgCounter.createMany({ data: rows })),
      ).rejects.toBeInstanceOf(SignInRelationError);
    });

    it("still lets an ordinary upsert and create through", async () => {
      const upsert = (value: number) =>
        db.forOrg(upsertOrganizationId, (tx) =>
          tx.orgCounter.upsert({ where: counterKey("BK-2026"), create: { key: "BK-2026", value }, update: { value } }),
        );
      await expect(upsert(1)).resolves.toMatchObject({ key: "BK-2026", value: 1 });
      await expect(upsert(2)).resolves.toMatchObject({ key: "BK-2026", value: 2 });
      const role = await db.forOrg(upsertOrganizationId, (tx) =>
        tx.role.create({
          data: { key: "upserted", name: "Upserted", permissions: { create: { permission: "leads:create" } } },
          include: { permissions: true },
        }),
      );
      expect(role.permissions.map((grant) => grant.permission)).toEqual(["leads:create"]);
    });
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
