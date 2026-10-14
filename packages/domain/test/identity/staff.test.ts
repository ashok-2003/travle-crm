// Staff against Postgres: adding people with or without email, changing roles, resetting passwords and removing
// people (spec 6.3), with the rules that stop anyone reaching above their own access.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("staff", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  async function accessOf(userId: string, organizationId = agency.organizationId): Promise<MemberAccess> {
    const access = await test.identity.resolveAccess(userId, organizationId);
    if (!access) throw new Error("no access");
    return access;
  }

  /** Signs in with organization code and username through Better Auth; true when it succeeds. */
  async function canSignInByUsername(code: string, username: string, password: string): Promise<boolean> {
    const response = await test.identity.auth.api.signInUsername({
      body: { username: `${code}:${username}`.toLowerCase(), password },
      asResponse: true,
    });
    return response.ok;
  }

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await accessOf(agency.ownerUserId);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("adds staff without email, who sign in with the organization code and must change their password", async () => {
    const ravi = await test.identity.staff.create(owner, {
      name: "Ravi Kumar",
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    expect(ravi).toMatchObject({ email: null, username: "Ravi", role: { key: "sales", name: "Sales" } });
    expect(ravi.mustChangePassword).toBe(true);
    expect(await canSignInByUsername(agency.code, "RAVI", "temporary-pass-1")).toBe(true);
  });

  it("adds staff with email, who sign in by email", async () => {
    const meera = await test.identity.staff.create(owner, {
      name: "Meera",
      email: `meera-${agency.code.toLowerCase()}@example.test`,
      roleKey: "operations",
      temporaryPassword: "temporary-pass-2",
    });
    expect(meera.email).toBe(`meera-${agency.code.toLowerCase()}@example.test`);
    await expect(signInByEmail(test.identity, meera.email ?? "", "temporary-pass-2")).resolves.toBeInstanceOf(Headers);
  });

  it("lists only this organization's staff, never showing placeholder addresses", async () => {
    const own = await createTestAgency(test.identity, platform);
    const other = await createTestAgency(test.identity, platform);
    const ownOwner = await accessOf(own.ownerUserId, own.organizationId);
    await test.identity.staff.create(ownOwner, {
      name: "Ravi Kumar",
      username: "ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.identity.staff.create(ownOwner, {
      name: "Meera",
      email: `meera-${own.code.toLowerCase()}@example.test`,
      roleKey: "operations",
      temporaryPassword: "temporary-pass-2",
    });
    const staff = await test.identity.staff.list(ownOwner);
    expect(staff.map((member) => member.name)).toEqual(["Asha Owner", "Ravi Kumar", "Meera"]);
    expect(staff.some((member) => member.userId === other.ownerUserId)).toBe(false);
    expect(staff.every((member) => !member.email?.endsWith(".invalid"))).toBe(true);
  });

  it("refuses a username already taken in the organization, ignoring case", async () => {
    await test.identity.staff.create(owner, {
      name: "First Ravi",
      username: "taken-name",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-3",
    });
    await expect(
      test.identity.staff.create(owner, {
        name: "Another Ravi",
        username: "TAKEN-name",
        roleKey: "sales",
        temporaryPassword: "temporary-pass-3",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("lets the same username exist in two organizations", async () => {
    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    await expect(
      test.identity.staff.create(otherOwner, {
        name: "Ravi",
        username: "ravi",
        roleKey: "sales",
        temporaryPassword: "temporary-pass-4",
      }),
    ).resolves.toMatchObject({ username: "ravi" });
  });

  describe("an Admin", () => {
    let admin: MemberAccess;
    let directors: { key: string };

    beforeAll(async () => {
      directors = await test.identity.roles.create(owner, {
        name: "Directors",
        permissions: [{ permission: "roles:manage" }],
      });
      const created = await test.identity.staff.create(owner, {
        name: "Admin",
        username: "admin",
        roleKey: "org-admin",
        temporaryPassword: "temporary-pass-5",
      });
      admin = await accessOf(created.userId);
    });

    it("cannot make anyone an Owner", async () => {
      await expect(
        test.identity.staff.create(admin, {
          name: "New boss",
          username: "boss",
          roleKey: "org-owner",
          temporaryPassword: "temporary-pass-6",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "OWNER_ONLY" });
    });

    it("cannot give a role that allows more than they hold", async () => {
      await expect(
        test.identity.staff.create(admin, {
          name: "Director",
          username: "director",
          roleKey: directors.key,
          temporaryPassword: "temporary-pass-7",
        }),
      ).rejects.toMatchObject({ reason: "EXCEEDS_YOUR_PERMISSIONS" });
    });

    it("cannot change, reset or remove the Owner", async () => {
      const target = { memberId: agency.ownerMemberId };
      await expect(test.identity.staff.updateRole(admin, { ...target, roleKey: "sales" })).rejects.toMatchObject({
        reason: "OWNER_ONLY",
      });
      await expect(
        test.identity.staff.resetPassword(admin, { ...target, temporaryPassword: "hijacked-pass-1" }),
      ).rejects.toMatchObject({
        reason: "OWNER_ONLY",
      });
      await expect(test.identity.staff.remove(admin, target)).rejects.toMatchObject({ reason: "OWNER_ONLY" });
    });

    it("cannot manage a member whose role allows more than theirs", async () => {
      const director = await test.identity.staff.create(owner, {
        name: "Director Two",
        username: "director2",
        roleKey: directors.key,
        temporaryPassword: "temporary-pass-9",
      });
      const target = { memberId: director.memberId };
      await expect(test.identity.staff.updateRole(admin, { ...target, roleKey: "sales" })).rejects.toMatchObject({
        reason: "EXCEEDS_YOUR_PERMISSIONS",
      });
      await expect(
        test.identity.staff.resetPassword(admin, { ...target, temporaryPassword: "hijacked-pass-2" }),
      ).rejects.toMatchObject({ reason: "EXCEEDS_YOUR_PERMISSIONS" });
      await expect(test.identity.staff.remove(admin, target)).rejects.toMatchObject({
        reason: "EXCEEDS_YOUR_PERMISSIONS",
      });
    });

    it("cannot make someone an Owner by changing their role", async () => {
      const helper = await test.identity.staff.create(owner, {
        name: "Helper",
        username: "helper",
        roleKey: "sales",
        temporaryPassword: "temporary-pass-10",
      });
      await expect(
        test.identity.staff.updateRole(admin, { memberId: helper.memberId, roleKey: "org-owner" }),
      ).rejects.toMatchObject({ reason: "OWNER_ONLY" });
    });

    it("cannot change their own access", async () => {
      await expect(
        test.identity.staff.updateRole(admin, { memberId: admin.memberId, roleKey: "sales" }),
      ).rejects.toMatchObject({
        reason: "CANNOT_CHANGE_YOURSELF",
      });
    });
  });

  it("stops the Owner removing or demoting themselves, so the organization keeps an Owner", async () => {
    await expect(test.identity.staff.remove(owner, { memberId: owner.memberId })).rejects.toMatchObject({
      reason: "CANNOT_CHANGE_YOURSELF",
    });
    await expect(
      test.identity.staff.updateRole(owner, { memberId: owner.memberId, roleKey: "sales" }),
    ).rejects.toMatchObject({
      reason: "CANNOT_CHANGE_YOURSELF",
    });
  });

  it("changes a member's role, effective on their next request", async () => {
    const tara = await test.identity.staff.create(owner, {
      name: "Tara",
      username: "tara",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-8",
    });
    const moved = await test.identity.staff.updateRole(owner, { memberId: tara.memberId, roleKey: "accounts" });
    expect(moved.role).toEqual({ key: "accounts", name: "Accounts" });
    expect((await accessOf(tara.userId)).permissions.has("money:view_margin")).toBe(true);
  });

  it("treats a member of another organization as not found", async () => {
    const other = await createTestAgency(test.identity, platform);
    await expect(test.identity.staff.remove(owner, { memberId: other.ownerMemberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "MEMBER_NOT_FOUND",
    });
  });

  it("leaves a member of another organization unchanged when asked to change or reset them", async () => {
    const other = await createTestAgency(test.identity, platform);
    await expect(
      test.identity.staff.updateRole(owner, { memberId: other.ownerMemberId, roleKey: "sales" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "MEMBER_NOT_FOUND" });
    await expect(
      test.identity.staff.resetPassword(owner, { memberId: other.ownerMemberId, temporaryPassword: "hijacked-pass-3" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "MEMBER_NOT_FOUND" });
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    expect(otherOwner.role.isOwner).toBe(true);
    await expect(signInByEmail(test.identity, other.ownerEmail, other.ownerPassword)).resolves.toBeInstanceOf(Headers);
  });

  it("keeps an Owner when two Owners remove each other at the same moment", async () => {
    const own = await createTestAgency(test.identity, platform);
    const first = await accessOf(own.ownerUserId, own.organizationId);
    const created = await test.identity.staff.create(first, {
      name: "Second Owner",
      username: "owner2",
      roleKey: "org-owner",
      temporaryPassword: "temporary-pass-11",
    });
    const second = await accessOf(created.userId, own.organizationId);
    const results = await Promise.allSettled([
      test.identity.staff.remove(first, { memberId: second.memberId }),
      test.identity.staff.remove(second, { memberId: first.memberId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const owners = await test.database.client.member.count({
      where: { organizationId: own.organizationId, role: "org-owner", deletedAt: null },
    });
    expect(owners).toBe(1);
  });

  it("resets a password to a temporary one and signs the person out everywhere", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const sunil = await test.identity.staff.create(owner, {
      name: "Sunil",
      username: "sunil",
      roleKey: "sales",
      temporaryPassword: "first-temp-pass-1",
    });
    await test.database.client.user.update({ where: { id: sunil.userId }, data: { mustChangePassword: false } });
    expect(await canSignInByUsername(agency.code, "sunil", "first-temp-pass-1")).toBe(true);
    await test.identity.staff.resetPassword(owner, {
      memberId: sunil.memberId,
      temporaryPassword: "second-temp-pass-1",
    });
    expect(await test.database.client.session.count({ where: { userId: sunil.userId } })).toBe(0);
    expect(await canSignInByUsername(agency.code, "sunil", "first-temp-pass-1")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid password"));
    expect(await canSignInByUsername(agency.code, "sunil", "second-temp-pass-1")).toBe(true);
    expect((await accessOf(sunil.userId)).mustChangePassword).toBe(true);
  });

  it("removes a person: no access, no sign-in, and their email and username are free again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const email = `kiran-${agency.code.toLowerCase()}@example.test`;
    const kiran = await test.identity.staff.create(owner, {
      name: "Kiran",
      email,
      username: "kiran",
      roleKey: "sales",
      temporaryPassword: "kiran-temp-pass-1",
    });
    await signInByEmail(test.identity, email, "kiran-temp-pass-1");
    await test.identity.staff.remove(owner, { memberId: kiran.memberId });

    expect(await test.identity.resolveAccess(kiran.userId, agency.organizationId)).toBeNull();
    expect(await test.database.client.session.count({ where: { userId: kiran.userId } })).toBe(0);
    await expect(signInByEmail(test.identity, email, "kiran-temp-pass-1")).rejects.toThrow(/Sign-in failed/);
    expect(await canSignInByUsername(agency.code, "kiran", "kiran-temp-pass-1")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));

    // The retired address can be worked out from the user id, so the wiped password and the ban each refuse it.
    const retired = `removed-${kiran.userId}@no-email.invalid`;
    await expect(signInByEmail(test.identity, retired, "kiran-temp-pass-1")).rejects.toThrow(/Sign-in failed/);
    expect(await test.database.client.account.findFirst({ where: { userId: kiran.userId } })).toMatchObject({
      password: null,
    });
    await test.database.client.user.update({ where: { id: kiran.userId }, data: { banned: false } });
    try {
      await expect(signInByEmail(test.identity, retired, "kiran-temp-pass-1")).rejects.toThrow(/Sign-in failed/);
    } finally {
      await test.database.client.user.update({ where: { id: kiran.userId }, data: { banned: true } });
    }
    expect(await test.database.client.user.findUnique({ where: { id: kiran.userId } })).toMatchObject({
      formerEmail: email,
      banned: true,
    });
    expect((await test.identity.staff.list(owner)).some((member) => member.memberId === kiran.memberId)).toBe(false);

    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    await expect(
      test.identity.staff.create(otherOwner, {
        name: "Kiran",
        email,
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-2",
      }),
    ).resolves.toMatchObject({ email });
    await expect(
      test.identity.staff.create(owner, {
        name: "Kiran Two",
        username: "kiran",
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-3",
      }),
    ).resolves.toMatchObject({ username: "kiran" });
    await expect(test.identity.staff.remove(owner, { memberId: kiran.memberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("two-factor requirement", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("cannot be switched on by someone who doesn't use two-factor themselves", async () => {
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "ENABLE_TWO_FACTOR_FIRST",
    });
  });

  it("once on, asks every member without two-factor to set it up", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { twoFactorEnabled: true } });
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: true })).resolves.toEqual({
      requireTwoFactor: true,
    });
    const sales = await test.identity.staff.create(owner, {
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.database.client.user.update({ where: { id: sales.userId }, data: { mustChangePassword: false } });
    const ravi = await test.identity.resolveAccess(sales.userId, agency.organizationId);
    expect(ravi?.organizationRequiresTwoFactor).toBe(true);
    expect(ravi?.twoFactorEnabled).toBe(false);
  });

  it("can be switched off again, and the choice is stored", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { twoFactorEnabled: true } });
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await test.identity.settings.setTwoFactorRequirement(owner, { required: true });
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: false })).resolves.toEqual({
      requireTwoFactor: false,
    });
    const stored = await platform.organization.findUniqueOrThrow({ where: { id: agency.organizationId } });
    expect(stored.requireTwoFactor).toBe(false);
  });
});
