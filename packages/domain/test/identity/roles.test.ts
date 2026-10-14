// Roles against Postgres: listing, creating, changing and deleting, and the rules that stop anyone granting more
// than they hold or touching the Owner role.
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("roles", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;
  let admin: MemberAccess;

  /** The access of a new member with the given role. */
  async function memberWithRole(roleKey: string, username: string): Promise<MemberAccess> {
    const created = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: username,
      username,
      roleKey,
      password: "member-password-1",
      mustChangePassword: false,
    });
    const access = await test.identity.resolveAccess(created.userId, agency.organizationId);
    if (!access) throw new Error("new member has no access");
    return access;
  }

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    const ownerAccess = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!ownerAccess) throw new Error("owner has no access");
    owner = ownerAccess;
    admin = await memberWithRole("org-admin", "admin1");
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("lists the roles Owner first, with what each allows and how many staff have it", async () => {
    const roles = await test.identity.roles.list(owner);
    expect(roles.map((role) => role.name)).toEqual(["Owner", "Accounts", "Admin", "Operations", "Sales"]);
    expect(roles.find((role) => role.isOwner)?.memberCount).toBe(1);
    expect(roles.find((role) => role.name === "Admin")?.memberCount).toBe(1);
    expect(roles.find((role) => role.name === "Sales")?.permissions).toContainEqual({
      permission: "leads:view",
      scope: "own",
    });
  });

  it("creates a role with a readable key, whatever script its name is in", async () => {
    const created = await test.identity.roles.create(owner, {
      name: "Senior sales",
      permissions: [{ permission: "leads:view", scope: "all" }, { permission: "money:view_margin" }],
    });
    expect(created.key).toMatch(/^senior-sales-[0-9a-f]{6}$/);
    expect(created.permissions).toEqual([
      { permission: "money:view_margin", scope: null },
      { permission: "leads:view", scope: "all" },
    ]);
    const hindi = await test.identity.roles.create(owner, { name: "बिक्री टीम", permissions: [] });
    expect(hindi.key).toMatch(/^role-[0-9a-f]{6}$/);
  });

  it("refuses a second role with the same name, ignoring case", async () => {
    await expect(test.identity.roles.create(owner, { name: "sales", permissions: [] })).rejects.toMatchObject({
      reason: "ROLE_NAME_TAKEN",
    });
  });

  it("stops a member granting a permission they don't hold", async () => {
    await expect(
      test.identity.roles.create(admin, { name: "Role editors", permissions: [{ permission: "roles:manage" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "EXCEEDS_YOUR_PERMISSIONS" });
  });

  it("changes a role's name and permissions, and the change applies on the next request", async () => {
    const guides = await test.identity.roles.create(owner, { name: "Guides", permissions: [] });
    const guide = await memberWithRole(guides.key, "guide1");
    expect(guide.permissions.has("departures:view")).toBe(false);
    const updated = await test.identity.roles.update(owner, {
      key: guides.key,
      name: "Trip guides",
      permissions: [{ permission: "departures:view" }],
    });
    expect(updated).toMatchObject({ name: "Trip guides", memberCount: 1 });
    const after = await test.identity.resolveAccess(guide.userId, agency.organizationId);
    expect(after?.permissions.has("departures:view")).toBe(true);
    expect(after?.role.name).toBe("Trip guides");
  });

  it("keeps the Owner role fixed", async () => {
    await expect(test.identity.roles.update(owner, { key: "org-owner", name: "Boss" })).rejects.toMatchObject({
      reason: "OWNER_ROLE_IS_FIXED",
    });
    await expect(test.identity.roles.delete(owner, { key: "org-owner" })).rejects.toMatchObject({
      reason: "OWNER_ROLE_IS_FIXED",
    });
  });

  it("stops a member editing a role that allows more than they hold", async () => {
    const directors = await test.identity.roles.create(owner, {
      name: "Directors",
      permissions: [{ permission: "roles:manage" }],
    });
    await expect(test.identity.roles.update(admin, { key: directors.key, permissions: [] })).rejects.toMatchObject({
      reason: "EXCEEDS_YOUR_PERMISSIONS",
    });
  });

  it("refuses to delete a role staff still have", async () => {
    await expect(test.identity.roles.delete(owner, { key: "org-admin" })).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "ROLE_IN_USE",
    });
  });

  it("deletes an unused role, which frees its name", async () => {
    const temporary = await test.identity.roles.create(owner, { name: "Interns", permissions: [] });
    await test.identity.roles.delete(owner, { key: temporary.key });
    const names = (await test.identity.roles.list(owner)).map((role) => role.name);
    expect(names).not.toContain("Interns");
    await expect(test.identity.roles.create(owner, { name: "Interns", permissions: [] })).resolves.toMatchObject({
      name: "Interns",
    });
  });

  it("gives one of two simultaneous roles with the same name a conflict", async () => {
    const results = await Promise.allSettled([
      test.identity.roles.create(owner, { name: "Night desk", permissions: [] }),
      test.identity.roles.create(owner, { name: "Night desk", permissions: [] }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((result) => result.status === "rejected");
    expect(refused?.reason).toMatchObject({ code: "CONFLICT", reason: "ROLE_NAME_TAKEN" });
  });

  it("never lets a later role pick up the members of a deleted one", async () => {
    // Deleting a role with members is refused (above). Should a member still end up on a deleted role (say, through
    // a role change racing the delete), they keep no permissions, and a new role of the same name gets a new key.
    const couriers = await test.identity.roles.create(owner, {
      name: "Couriers",
      permissions: [{ permission: "departures:view" }],
    });
    const courier = await memberWithRole(couriers.key, "courier1");
    await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.updateMany({ where: { key: couriers.key }, data: softDeleted(agency.ownerUserId) }),
    );
    const again = await test.identity.roles.create(owner, {
      name: "Couriers",
      permissions: [{ permission: "departures:view" }],
    });
    expect(again.key).not.toBe(couriers.key);
    expect(again.memberCount).toBe(0);
    const access = await test.identity.resolveAccess(courier.userId, agency.organizationId);
    expect(access?.role.key).toBe(couriers.key);
    expect(access?.permissions.toGrants()).toEqual([]);
  });

  it("reports an unknown role as not found", async () => {
    await expect(test.identity.roles.update(owner, { key: "no-such-role", name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "ROLE_NOT_FOUND",
    });
  });
});
