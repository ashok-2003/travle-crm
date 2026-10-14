// The identity module against Postgres: starter roles, the first Owner, sessions that carry the organization,
// and the per-request access read behind request checks 1 and 4 (spec 6.5).
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { relabelTotpUri } from "../../src/identity/auth/totp-label.js";
import { permissions } from "../../src/identity/permissions.js";
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
    expect(access?.permissions.scopeOf("leads:view")).toBe("own");
    expect(access?.permissions.has("staff:manage")).toBe(false);
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
      username: "Meera",
      roleKey: "operations",
      password: "meera-password-1",
      mustChangePassword: true,
    });
    const me = await test.identity.describeSignedInPerson({
      userId: meera.userId,
      organizationId: agency.organizationId,
      impersonatedBy: null,
    });
    expect(me?.user).toMatchObject({ name: "Meera", email: null, username: "Meera" });
    expect(me?.member?.role.key).toBe("operations");
    expect(me?.pendingStep).toBe("CHANGE_PASSWORD");
    expect(me?.isPlatformAdmin).toBe(false);
  });

  it("labels a placeholder account in a two-factor link with the organization code and username", async () => {
    const link = `otpauth://totp/Test%20CRM:${encodeURIComponent(`${agency.code.toLowerCase()}-meera@no-email.invalid`)}?secret=ABC&issuer=Test`;
    const relabelled = await relabelTotpUri(test.database.client, link);
    expect(decodeURIComponent(relabelled)).toContain(`Test CRM:${agency.code} Meera?secret=ABC`);
    const withEmail = "otpauth://totp/Test%20CRM:asha%40example.test?secret=ABC";
    expect(await relabelTotpUri(test.database.client, withEmail)).toBe(withEmail);
  });

  it("treats a user as platform staff only with the admin role and no membership", async () => {
    const admin = await test.database.client.user.create({
      data: { name: "Support", email: `support-${agency.code.toLowerCase()}@example.test`, role: "admin" },
    });
    expect(await test.identity.isPlatformAdmin(admin)).toBe(true);
    expect(await test.identity.isPlatformAdmin({ id: agency.ownerUserId, role: "admin" })).toBe(false);
    expect(await test.identity.isPlatformAdmin({ id: admin.id, role: null })).toBe(false);
  });
});
