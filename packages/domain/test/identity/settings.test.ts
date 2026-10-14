// The organization's two-factor requirement (spec 6.2) against Postgres: who may switch it, and what it asks of members.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

describe("two-factor requirement", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(() => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
  });

  // Every test gets its own organization, so none depends on another's state.
  beforeEach(async () => {
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  /** An Admin of this test's organization who uses two-factor, so the requirement's own precondition holds. */
  async function adminWithTwoFactor(): Promise<MemberAccess> {
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    const created = await test.identity.staff.create(owner, {
      name: "Admin",
      username: "admin",
      roleKey: "org-admin",
      temporaryPassword: "temporary-pass-2",
    });
    await test.database.client.user.update({ where: { id: created.userId }, data: { twoFactorEnabled: true } });
    const admin = await test.identity.resolveAccess(created.userId, agency.organizationId);
    if (!admin) throw new Error("no access");
    return admin;
  }

  const storedRequirement = async () =>
    (await platform.organization.findUniqueOrThrow({ where: { id: agency.organizationId } })).requireTwoFactor;

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

  it("can be switched on by an Admin", async () => {
    const admin = await adminWithTwoFactor();
    await expect(test.identity.settings.setTwoFactorRequirement(admin, { required: true })).resolves.toEqual({
      requireTwoFactor: true,
    });
    expect(await storedRequirement()).toBe(true);
  });

  it("cannot be switched off by an Admin: spec 6.2 lets an Owner require it", async () => {
    const admin = await adminWithTwoFactor();
    await test.identity.settings.setTwoFactorRequirement(admin, { required: true });
    await expect(test.identity.settings.setTwoFactorRequirement(admin, { required: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "OWNER_ONLY",
    });
    expect(await storedRequirement()).toBe(true);
  });

  it("can be switched off by an Owner, and the choice is stored", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { twoFactorEnabled: true } });
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await test.identity.settings.setTwoFactorRequirement(owner, { required: true });
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: false })).resolves.toEqual({
      requireTwoFactor: false,
    });
    expect(await storedRequirement()).toBe(false);
  });
});
