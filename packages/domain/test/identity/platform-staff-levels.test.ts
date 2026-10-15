// Platform staff have two levels (spec 5, 6.1): support (Better Auth role "admin") and super admin ("super-admin").
// Either way they have no membership, ever; anyone who has or had one is no platform staff, whatever their role.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("platform staff levels", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let agency: TestAgency;

  beforeAll(async () => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  /** A person who has never been a member, with this Better Auth role and a password. */
  async function outsider(role: string | null, mustChangePassword = false) {
    const email = `staff-${crypto.randomUUID()}@platform.test`;
    const user = await platform.user.create({ data: { name: "Platform person", email, role, mustChangePassword } });
    const hash = await (await test.identity.auth.$context).password.hash("platform-password-1");
    await platform.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
    return { userId: user.id, email };
  }

  it("knows support by the admin role, and a super admin by the super-admin role", async () => {
    const support = await outsider("admin");
    const superAdmin = await outsider("super-admin");
    expect(await test.identity.describePlatformStaff(support.userId)).toEqual({
      userId: support.userId,
      name: "Platform person",
      level: "support",
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
    expect(await test.identity.describePlatformStaff(superAdmin.userId)).toMatchObject({ level: "super-admin" });
    expect(await test.identity.isPlatformAdmin({ id: superAdmin.userId })).toBe(true);
  });

  it("gives no level to people without a platform role, or who have ever been members", async () => {
    expect(await test.identity.describePlatformStaff((await outsider(null)).userId)).toBeNull();
    expect(await test.identity.describePlatformStaff((await outsider("user")).userId)).toBeNull();
    expect(await test.identity.describePlatformStaff((await outsider("admin,super-admin")).userId)).toBeNull();
    await platform.user.update({ where: { id: agency.ownerUserId }, data: { role: "super-admin" } });
    try {
      expect(await test.identity.describePlatformStaff(agency.ownerUserId)).toBeNull();
      expect(await test.identity.isPlatformAdmin({ id: agency.ownerUserId })).toBe(false);
    } finally {
      await platform.user.update({ where: { id: agency.ownerUserId }, data: { role: null } });
    }
    expect(await test.identity.describePlatformStaff(crypto.randomUUID())).toBeNull();
  });

  it("says when platform staff still have a temporary password to replace", async () => {
    const newcomer = await outsider("admin", true);
    expect(await test.identity.describePlatformStaff(newcomer.userId)).toMatchObject({ mustChangePassword: true });
  });

  it("says whether platform staff sign in with two-factor, which the console requires", async () => {
    const support = await outsider("admin");
    await platform.user.update({ where: { id: support.userId }, data: { twoFactorEnabled: true } });
    expect(await test.identity.describePlatformStaff(support.userId)).toMatchObject({ twoFactorEnabled: true });
  });

  it("refuses to make a member a super admin through Better Auth's admin endpoints", async () => {
    const superAdmin = await outsider("super-admin");
    const headers = await signInByEmail(test.identity, superAdmin.email, "platform-password-1");
    await expect(
      test.identity.auth.api.setRole({ headers, body: { userId: agency.ownerUserId, role: "super-admin" } }),
    ).rejects.toMatchObject({ body: { code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF" } });
  });
});
