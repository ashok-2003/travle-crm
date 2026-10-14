// Staff changes racing other changes (spec 6.3): each change locks what it checked, so one that lands meanwhile makes
// it fail (STAFF_CHANGED, ROLE_NOT_FOUND...) instead of being overwritten. A transaction on a second connection holds
// the conflicting change open, and the test waits until the staff change is stuck behind it before letting it commit.
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

describe("staff changes racing other changes", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;
  let admin: MemberAccess;

  async function accessOf(userId: string): Promise<MemberAccess> {
    const access = await test.identity.resolveAccess(userId, agency.organizationId);
    if (!access) throw new Error("no access");
    return access;
  }

  async function addStaff(username: string, roleKey = "sales") {
    return test.identity.staff.create(owner, {
      name: username,
      username,
      roleKey,
      temporaryPassword: "temporary-pass-1",
    });
  }

  /**
   * Waits until a statement containing `statement` is waiting for a lock. Test files share one Postgres and run in
   * parallel, so the statement is matched: another file's lock wait must not count.
   */
  async function waitUntilBlockedAt(statement: string): Promise<void> {
    for (let tries = 0; tries < 60; tries++) {
      const [waiting] = await test.database.client.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database() AND query LIKE ${`%${statement}%`}`;
      if ((waiting?.n ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Nothing waited for a lock at: ${statement}`);
  }

  // The statements as Prisma sends them: its own updates, and the identity module's tagged row locks.
  const memberUpdate = 'UPDATE "public"."member" SET';
  const memberLock = "SELECT id FROM member WHERE id = ";

  const credentialOf = (userId: string) =>
    test.database.client.account.findFirstOrThrow({ where: { userId, providerId: "credential" } });

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await accessOf(agency.ownerUserId);
    admin = await accessOf((await addStaff("admin", "org-admin")).userId);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("refuses to change someone who was promoted after they were looked at", async () => {
    const target = await addStaff("promoted");
    let change: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Holding the member row makes the Admin's write wait, after the Admin has already read the old role.
      await tx.$queryRaw`SELECT id FROM member WHERE id = ${target.memberId}::uuid FOR UPDATE`;
      change = test.identity.staff.updateRole(admin, { memberId: target.memberId, roleKey: "operations" });
      change.catch(() => undefined);
      await waitUntilBlockedAt(memberUpdate);
      await tx.member.update({ where: { id: target.memberId }, data: { role: "org-owner" } });
    });
    await expect(change).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    const stored = await test.database.client.member.findUniqueOrThrow({ where: { id: target.memberId } });
    expect(stored.role).toBe("org-owner");
  });

  it("refuses an Admin's password reset of someone being made an Owner at that moment", async () => {
    const target = await addStaff("tara");
    const before = await credentialOf(target.userId);
    let reset: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // An Owner's promotion of the target, not yet committed: the Admin still reads the old role.
      await tx.member.update({ where: { id: target.memberId }, data: { role: "org-owner" } });
      reset = test.identity.staff.resetPassword(admin, {
        memberId: target.memberId,
        temporaryPassword: "admin-knows-this",
      });
      reset.catch(() => undefined);
      await waitUntilBlockedAt(memberLock);
    });
    await expect(reset).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    expect((await credentialOf(target.userId)).password).toBe(before.password);
  });

  it("refuses a password reset that waited for a removal, so the removed person keeps no password", async () => {
    const target = await addStaff("rohan");
    let removal: Promise<unknown> = Promise.resolve();
    let reset: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Holding the account row stops the removal after it has soft-deleted the membership, before it wipes the password.
      await tx.$queryRaw`SELECT id FROM account WHERE user_id = ${target.userId}::uuid FOR UPDATE`;
      removal = test.identity.staff.remove(owner, { memberId: target.memberId });
      removal.catch(() => undefined);
      await waitUntilBlockedAt('UPDATE "public"."account" SET');
      reset = test.identity.staff.resetPassword(owner, {
        memberId: target.memberId,
        temporaryPassword: "after-removal-1",
      });
      reset.catch(() => undefined);
      await waitUntilBlockedAt(memberLock);
    });
    await expect(removal).resolves.toBeUndefined();
    await expect(reset).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    expect((await credentialOf(target.userId)).password).toBeNull();
  });

  it("refuses to remove someone whose role changed after they were looked at", async () => {
    const target = await addStaff("moved");
    let removal: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Someone else's move of the target, not yet committed: the Admin's removal still reads the old role.
      await tx.member.update({ where: { id: target.memberId }, data: { role: "operations" } });
      removal = test.identity.staff.remove(admin, { memberId: target.memberId });
      removal.catch(() => undefined);
      await waitUntilBlockedAt(memberUpdate);
    });
    await expect(removal).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    const stored = await test.database.client.member.findUniqueOrThrow({ where: { id: target.memberId } });
    expect(stored).toMatchObject({ role: "operations", deletedAt: null });
  });

  describe("adding someone while their role changes", () => {
    const roleLock = 'SELECT id FROM "role" WHERE key = ';
    const signInName = (username: string) => `${agency.code.toLowerCase()}:${username}`;

    it("waits for a deletion of the role, then refuses with ROLE_NOT_FOUND and adds nobody", async () => {
      const role = await test.identity.roles.create(owner, { name: "Seasonal", permissions: [] });
      let creation: Promise<unknown> = Promise.resolve();
      await platform.$transaction(async (tx) => {
        // An Owner's deleteRole, not yet committed.
        await tx.role.updateMany({
          where: { organizationId: agency.organizationId, key: role.key },
          data: softDeleted(agency.ownerUserId),
        });
        creation = test.identity.staff.create(owner, {
          name: "Late",
          username: "late",
          roleKey: role.key,
          temporaryPassword: "temporary-pass-2",
        });
        creation.catch(() => undefined);
        await waitUntilBlockedAt(roleLock);
      });
      await expect(creation).rejects.toMatchObject({ code: "NOT_FOUND", reason: "ROLE_NOT_FOUND" });
      expect(await test.database.client.user.findUnique({ where: { username: signInName("late") } })).toBeNull();
    });

    it("waits for a widening of the role, then refuses an Admin it now exceeds", async () => {
      const role = await test.identity.roles.create(owner, {
        name: "Front desk",
        permissions: [{ permission: "leads:view", scope: "own" }],
      });
      let creation: Promise<unknown> = Promise.resolve();
      await platform.$transaction(async (tx) => {
        // An Owner's updateRole adding roles:manage, which Admins lack, not yet committed. updateRole locks the row first.
        const [locked] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "role" WHERE organization_id = ${agency.organizationId}::uuid AND key = ${role.key} FOR UPDATE`;
        if (!locked) throw new Error("role not found");
        await tx.rolePermission.create({
          data: { organizationId: agency.organizationId, roleId: locked.id, permission: "roles:manage" },
        });
        creation = test.identity.staff.create(admin, {
          name: "Desk",
          username: "desk",
          roleKey: role.key,
          temporaryPassword: "temporary-pass-3",
        });
        creation.catch(() => undefined);
        await waitUntilBlockedAt(roleLock);
      });
      await expect(creation).rejects.toMatchObject({ code: "FORBIDDEN", reason: "EXCEEDS_YOUR_PERMISSIONS" });
      expect(await test.database.client.user.findUnique({ where: { username: signInName("desk") } })).toBeNull();
    });
  });

  it("can still reset, move or remove someone left on a deleted role", async () => {
    const role = await test.identity.roles.create(owner, {
      name: "Retired role",
      permissions: [{ permission: "leads:view", scope: "own" }],
    });
    const moving = await addStaff("stranded1");
    const leaving = await addStaff("stranded2");
    // What a createStaff racing deleteRole could leave behind before createStaff locked the role: a deleted role.
    for (const { memberId } of [moving, leaving]) {
      await test.database.client.member.update({ where: { id: memberId }, data: { role: role.key } });
    }
    await platform.role.updateMany({
      where: { organizationId: agency.organizationId, key: role.key },
      data: softDeleted(agency.ownerUserId),
    });
    // The Admin's checks still read the deleted role's permissions, which they hold.
    await expect(
      test.identity.staff.updateRole(admin, { memberId: moving.memberId, roleKey: "sales" }),
    ).resolves.toMatchObject({ role: { key: "sales" } });
    await expect(
      test.identity.staff.resetPassword(admin, { memberId: leaving.memberId, temporaryPassword: "stranded-pass-1" }),
    ).resolves.toBeUndefined();
    await expect(test.identity.staff.remove(admin, { memberId: leaving.memberId })).resolves.toBeUndefined();
  });
});
