// The identity module against Postgres: starter roles, the first Owner, sessions that carry the organization,
// and the per-request access read behind request checks 1 and 4 (spec 6.5).
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { relabelTotpUri } from "../../src/identity/auth/totp-label.js";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { permissions } from "../../src/identity/permissions.js";
import { starterRoles } from "../../src/identity/starter-roles.js";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("identity access", () => {
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

  it("gives a new organization the five starter roles, once", async () => {
    const roles = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findMany({ orderBy: { name: "asc" } }),
    );
    expect(roles.map((role) => role.name)).toEqual(["Accounts", "Admin", "Operations", "Owner", "Sales"]);
    await expect(test.identity.seedStarterRoles(agency.organizationId)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "ROLES_ALREADY_SEEDED",
    });
  });

  it("signs the Owner in by email into a session that carries their organization", async () => {
    const headers = await signInByEmail(test.identity, agency.ownerEmail.toUpperCase(), agency.ownerPassword);
    const session = await test.identity.auth.api.getSession({ headers });
    expect(session?.session.activeOrganizationId).toBe(agency.organizationId);
  });

  it("gives the Owner every permission in the catalog", async () => {
    const access = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    expect(access?.role).toEqual({ key: "org-owner", name: "Owner", isOwner: true });
    expect(access?.permissions.missing([...permissions])).toEqual([]);
  });

  it("gives other members exactly their role's permissions", async () => {
    const sales = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      password: "ravi-password-1",
      mustChangePassword: true,
    });
    const access = await test.identity.resolveAccess(sales.userId, agency.organizationId);
    const salesRole = starterRoles.find((role) => role.key === "sales");
    expect(access?.permissions.toGrants()).toEqual(PermissionSet.fromStored(salesRole?.grants ?? []).toGrants());
    expect(access?.mustChangePassword).toBe(true);
  });

  it("finds no access in another organization, for an unknown user, or after removal", async () => {
    const other = await createTestAgency(test.identity, platform);
    expect(await test.identity.resolveAccess(agency.ownerUserId, other.organizationId)).toBeNull();
    expect(await test.identity.resolveAccess("0199c3a2-0000-7000-8000-000000000009", agency.organizationId)).toBeNull();
    await test.database.client.member.update({
      where: { id: other.ownerMemberId },
      data: softDeleted(other.ownerUserId),
    });
    expect(await test.identity.resolveAccess(other.ownerUserId, other.organizationId)).toBeNull();
  });

  it("refuses an email or username that is already in use", async () => {
    await expect(
      test.identity.createOrganizationOwner(agency.organizationId, {
        name: "Copy",
        email: agency.ownerEmail,
        password: "copy-password-1",
        mustChangePassword: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("describes a member without email without showing their placeholder address", async () => {
    const meera = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Meera",
      username: "Meera2",
      roleKey: "operations",
      password: "meera-password-1",
      mustChangePassword: true,
    });
    const me = await test.identity.describeSignedInPerson({
      userId: meera.userId,
      organizationId: agency.organizationId,
      impersonatedBy: null,
    });
    expect(me?.user).toMatchObject({ name: "Meera", email: null, username: "Meera2" });
    expect(me?.member?.role.key).toBe("operations");
    expect(me?.pendingStep).toBe("CHANGE_PASSWORD");
    expect(me?.isPlatformAdmin).toBe(false);
  });

  it("labels a placeholder account in a two-factor link with the organization code and username", async () => {
    await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Label Test",
      username: "meera",
      roleKey: "operations",
      password: "label-password-1",
      mustChangePassword: false,
    });
    const link = `otpauth://totp/Test%20CRM:${encodeURIComponent(`${agency.code.toLowerCase()}-meera@no-email.invalid`)}?secret=ABC&issuer=Test`;
    const relabelled = await relabelTotpUri(test.database.client, link);
    expect(decodeURIComponent(relabelled)).toContain(`Test CRM:${agency.code} meera?secret=ABC`);
    const withEmail = "otpauth://totp/Test%20CRM:asha%40example.test?secret=ABC";
    expect(await relabelTotpUri(test.database.client, withEmail)).toBe(withEmail);
  });

  it("treats a user as platform staff only with the admin role and no membership", async () => {
    const admin = await test.database.client.user.create({
      data: { name: "Support", email: `support-${agency.code.toLowerCase()}@example.test`, role: "admin" },
    });
    expect(await test.identity.isPlatformAdmin(admin)).toBe(true);
    expect(await test.identity.isPlatformAdmin({ id: agency.ownerUserId, role: "admin" })).toBe(false);
    // The caller's role is ignored: the database says admin, so a caller claiming none changes nothing.
    expect(await test.identity.isPlatformAdmin({ id: admin.id, role: null })).toBe(true);
  });

  it("finds no access for a banned user until the ban expires", async () => {
    const staff = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Banned",
      username: "banned",
      roleKey: "sales",
      password: "banned-password-1",
      mustChangePassword: false,
    });
    const ban = (banExpires: Date | null) =>
      test.database.client.user.update({ where: { id: staff.userId }, data: { banned: true, banExpires } });
    await ban(null);
    expect(await test.identity.resolveAccess(staff.userId, agency.organizationId)).toBeNull();
    await ban(new Date(Date.now() + 60_000));
    expect(await test.identity.resolveAccess(staff.userId, agency.organizationId)).toBeNull();
    await ban(new Date(Date.now() - 60_000));
    expect(await test.identity.resolveAccess(staff.userId, agency.organizationId)).not.toBeNull();
  });

  it("reads the admin role from the database, not from the caller", async () => {
    const ordinary = await test.database.client.user.create({
      data: { name: "Plain", email: `plain-${agency.code.toLowerCase()}@example.test` },
    });
    expect(await test.identity.isPlatformAdmin({ id: ordinary.id, role: "admin" })).toBe(false);
  });

  it("stores a mixed-case email lower-cased, and the person can sign in with it", async () => {
    const mixed = `Mixed-${agency.code}@Example.Test`;
    const realHash = async (password: string) => (await test.identity.auth.$context).password.hash(password);
    await createStaffAccount(test.database, realHash, {
      organizationId: agency.organizationId,
      name: "Mixed",
      email: mixed,
      roleKey: "sales",
      password: "mixed-password-1",
      mustChangePassword: false,
    });
    const stored = await test.database.client.user.findUnique({ where: { email: mixed.toLowerCase() } });
    expect(stored).not.toBeNull();
    const headers = await signInByEmail(test.identity, mixed, "mixed-password-1");
    expect((await test.identity.auth.api.getSession({ headers }))?.user.id).toBe(stored?.id);
  });

  it("refuses a username that cannot be a sign-in name", async () => {
    await expect(
      createStaffAccount(test.database, hashPassword, {
        organizationId: agency.organizationId,
        name: "Bad",
        username: "has space",
        roleKey: "sales",
        password: "bad-password-12",
        mustChangePassword: false,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_USERNAME" });
  });
});
