// Identity's changes leave an audit trail (spec 9.5): who added, changed or removed staff and roles, and changed the
// two-factor setting, recorded in the same transaction, and support's impersonation with the admin's name on it.
// A refused change, including one that lost a race to another, records nothing.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createAuth } from "../../src/identity/auth/create-auth.js";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";
import {
  addStaffMember,
  createPlatformAdmin,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  testAuthSettings,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("identity's audit trail", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  const accessOf = (
    userId: string,
    session?: { impersonatedBy: string | null },
    organizationId = agency.organizationId,
  ) => memberAccessOf(test.identity, userId, organizationId, session);

  /** Adds a member of the agency with the given role, as the Owner. */
  const addStaff = (username: string, roleKey: string) => addStaffMember(test.identity, owner, username, roleKey);

  /** The staff entries about one record: other tests add other kinds (support's) to the same member. */
  async function staffEntriesAbout(entityId: string) {
    return (await entriesAbout(entityId)).filter((entry) => entry.action.startsWith("staff."));
  }

  /** The organization's entries about one record, oldest first. */
  async function entriesAbout(entityId: string) {
    return test.database.forOrg(agency.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    );
  }

  /** Better Auth's handler, as the api serves it at /api/auth. */
  function post(path: string, cookie: string, body: unknown, handler = test.identity.auth.handler): Promise<Response> {
    return handler(
      new Request(`http://localhost/api/auth${path}`, {
        method: "POST",
        headers: { cookie, origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  /** The cookies a browser would hold after these responses: the later value wins, an empty one deletes. */
  function cookiesAfter(cookie: string, ...responses: Response[]): string {
    const jar = new Map(cookie.split("; ").map((pair) => [pair.slice(0, pair.indexOf("=")), pair]));
    for (const setCookie of responses.flatMap((response) => response.headers.getSetCookie())) {
      const [pair = ""] = setCookie.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      if (pair.endsWith("=") || /max-age=0/i.test(setCookie)) jar.delete(name);
      else jar.set(name, pair);
    }
    return [...jar.values()].join("; ");
  }

  /** A platform admin (user role "admin", no membership), signed in; returns their id and session cookies. */
  async function signedInPlatformAdmin(): Promise<{ userId: string; cookie: string }> {
    const { userId, email } = await createPlatformAdmin(test, "support-password-1");
    const signIn = await post("/sign-in/email", "", { email, password: "support-password-1" });
    return { userId, cookie: cookiesAfter("", signIn) };
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

  it("records the first Owner as added by the system at onboarding", async () => {
    const entries = await staffEntriesAbout(agency.ownerMemberId);
    expect(entries).toEqual([
      expect.objectContaining({
        action: "staff.created",
        entityType: "member",
        actorUserId: null,
        source: "job",
        before: null,
        after: { role: "org-owner", hasEmail: true },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain("Asha");
  });

  it("records staff added, given another role, reset and removed, by whom, and never their email", async () => {
    const email = `ravi-${agency.code.toLowerCase()}@example.test`;
    const ravi = await test.identity.staff.create(owner, {
      name: "Ravi Kumar",
      email,
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.identity.staff.updateRole(owner, { memberId: ravi.memberId, roleKey: "operations" });
    // Giving someone the role they already have changes nothing, so it records nothing.
    await test.identity.staff.updateRole(owner, { memberId: ravi.memberId, roleKey: "operations" });
    await test.identity.staff.resetPassword(owner, { memberId: ravi.memberId, temporaryPassword: "temporary-pass-2" });
    await test.identity.staff.remove(owner, { memberId: ravi.memberId });

    const entries = await staffEntriesAbout(ravi.memberId);
    expect(entries.map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["staff.created", null, { role: "sales", hasEmail: true }],
      ["staff.role-changed", { role: "sales" }, { role: "operations" }],
      ["staff.password-reset", null, null],
      ["staff.removed", { role: "operations" }, null],
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ actorUserId: agency.ownerUserId, source: "web", impersonatedBy: null });
    }
    // Neither the address nor the name or sign-in name: the log outlives the account, which erasure clears (ADR 0015).
    expect(JSON.stringify(entries)).not.toContain(email);
    expect(JSON.stringify(entries)).not.toContain("Ravi");
  });

  it("records roles created, changed and deleted, but not an edit that changes nothing", async () => {
    const created = await test.identity.roles.create(owner, {
      name: "Visa desk",
      permissions: [{ permission: "bookings:view", scope: "all" }],
    });
    const role = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findFirstOrThrow({ where: { key: created.key } }),
    );
    await test.identity.roles.update(owner, { key: created.key, name: "Visa team" });
    await test.identity.roles.update(owner, { key: created.key, name: "Visa team" });
    await test.identity.roles.delete(owner, { key: created.key });

    const grants = [{ permission: "bookings:view", scope: "all" }];
    expect((await entriesAbout(role.id)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["role.created", null, { name: "Visa desk", permissions: grants }],
      ["role.updated", { name: "Visa desk", permissions: grants }, { name: "Visa team", permissions: grants }],
      ["role.deleted", { key: created.key, name: "Visa team", permissions: grants }, null],
    ]);
  });

  it("records the two-factor requirement changing, and neither a request that changes nothing nor a refused one", async () => {
    // Switching it on needs two-factor on the person doing it, and switching it off needs an Owner (spec 6.2). A second
    // Owner who uses two-factor does both, so the first Owner stays as the other tests need them.
    const coOwner = await addStaff("coowner", "org-owner");
    await test.database.client.user.update({ where: { id: coOwner.userId }, data: { twoFactorEnabled: true } });
    const coOwnerAccess = await accessOf(coOwner.userId);
    const admin = await accessOf((await addStaff("settings-admin", "org-admin")).userId);
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: false });
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: true });
    await expect(test.identity.settings.setTwoFactorRequirement(admin, { required: false })).rejects.toMatchObject({
      reason: "OWNER_ONLY",
    });
    await test.identity.settings.setTwoFactorRequirement(coOwnerAccess, { required: false });

    const entries = await entriesAbout(agency.organizationId);
    expect(entries.map((entry) => [entry.action, entry.actorUserId, entry.before, entry.after])).toEqual([
      [
        "settings.two-factor-requirement-changed",
        coOwner.userId,
        { requireTwoFactor: false },
        { requireTwoFactor: true },
      ],
      [
        "settings.two-factor-requirement-changed",
        coOwner.userId,
        { requireTwoFactor: true },
        { requireTwoFactor: false },
      ],
    ]);
    expect(entries.every((entry) => entry.entityType === "organization")).toBe(true);
  });

  it("records nothing when a change is refused", async () => {
    const admin = await test.identity.staff.create(owner, {
      name: "Admin One",
      username: "admin1",
      roleKey: "org-admin",
      temporaryPassword: "temporary-pass-3",
    });
    const adminAccess = await accessOf(admin.userId);
    await expect(
      test.identity.staff.resetPassword(adminAccess, {
        memberId: agency.ownerMemberId,
        temporaryPassword: "temporary-pass-4",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await staffEntriesAbout(agency.ownerMemberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("records nothing for a change that lost a race to another (STAFF_CHANGED)", async () => {
    const admin = await accessOf((await addStaff("racing-admin", "org-admin")).userId);
    const target = await addStaff("raced", "sales");
    let change: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Holding the member row makes the Admin's write wait after it has read the old role; then someone moves them.
      await tx.$queryRaw`SELECT id FROM member WHERE id = ${target.memberId}::uuid FOR UPDATE`;
      const holder = await backendPid(tx);
      change = test.identity.staff.updateRole(admin, { memberId: target.memberId, roleKey: "operations" });
      change.catch(() => undefined);
      await waitUntilBlockedBy(test.database.client, holder);
      await tx.member.update({ where: { id: target.memberId }, data: { role: "accounts" } });
    });
    await expect(change).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    expect((await staffEntriesAbout(target.memberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("records one removal when two Owners remove each other at the same moment", async () => {
    const own = await createTestAgency(test.identity, platform);
    const first = await accessOf(own.ownerUserId, undefined, own.organizationId);
    const created = await test.identity.staff.create(first, {
      name: "Second Owner",
      username: "owner2",
      roleKey: "org-owner",
      temporaryPassword: "temporary-pass-9",
    });
    const second = await accessOf(created.userId, undefined, own.organizationId);
    const [firstRemoves, secondRemoves] = await Promise.allSettled([
      test.identity.staff.remove(first, { memberId: second.memberId }),
      test.identity.staff.remove(second, { memberId: first.memberId }),
    ]);
    // The loser is refused with OWNER_ONLY once the winner commits (staff-removal.test.ts), and records nothing.
    const [winner, loser] = firstRemoves.status === "fulfilled" ? [first, second] : [second, first];
    const refused = firstRemoves.status === "fulfilled" ? secondRemoves : firstRemoves;
    expect(refused.status).toBe("rejected");
    expect(refused.status === "rejected" ? (refused.reason as unknown) : null).toMatchObject({ reason: "OWNER_ONLY" });
    const removals = await test.database.forOrg(own.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "staff.removed" } }),
    );
    expect(removals).toEqual([expect.objectContaining({ actorUserId: winner.userId, entityId: loser.memberId })]);
  });

  it("records what support does as a member as impersonation, naming the admin", async () => {
    const supportUserId = "0199e7a0-0000-7000-8000-0000000003a1";
    const impersonated = await accessOf(agency.ownerUserId, { impersonatedBy: supportUserId });
    const created = await test.identity.roles.create(impersonated, { name: "Support made", permissions: [] });
    const role = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findFirstOrThrow({ where: { key: created.key } }),
    );
    expect(await entriesAbout(role.id)).toEqual([
      expect.objectContaining({
        action: "role.created",
        actorUserId: agency.ownerUserId,
        source: "impersonation",
        impersonatedBy: supportUserId,
      }),
    ]);
  });

  it("records support starting and stopping an impersonation, in the member's organization", async () => {
    const support = await signedInPlatformAdmin();
    const started = await post("/admin/impersonate-user", support.cookie, { userId: agency.ownerUserId });
    expect(started.status).toBe(200);
    const stopped = await post("/admin/stop-impersonating", cookiesAfter(support.cookie, started), {});
    expect(stopped.status).toBe(200);

    const entries = (await entriesAbout(agency.ownerMemberId)).filter((entry) => entry.action.startsWith("support."));
    expect(entries.map((entry) => entry.action)).toEqual([
      "support.impersonation-started",
      "support.impersonation-stopped",
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        entityType: "member",
        actorUserId: support.userId,
        source: "impersonation",
        impersonatedBy: support.userId,
        after: { userId: agency.ownerUserId },
      });
    }
  });

  it("records no impersonation that was refused", async () => {
    const memberCookie = cookiesAfter(
      "",
      await post("/sign-in/email", "", { email: agency.ownerEmail, password: agency.ownerPassword }),
    );
    const other = await createTestAgency(test.identity, platform);
    const refused = await post("/admin/impersonate-user", memberCookie, { userId: other.ownerUserId });
    expect(refused.status).toBe(403);
    const entries = await test.database.forOrg(other.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { action: { startsWith: "support." } } }),
    );
    expect(entries).toEqual([]);
  });
  it("records a two-factor change once when two members make it at the same moment", async () => {
    const own = await createTestAgency(test.identity, platform);
    const ownerAccess = await accessOf(own.ownerUserId, undefined, own.organizationId);
    const admins: MemberAccess[] = [];
    for (const username of ["racer1", "racer2"]) {
      const created = await test.identity.staff.create(ownerAccess, {
        name: username,
        username,
        roleKey: "org-admin",
        temporaryPassword: "temporary-pass-5",
      });
      await test.database.client.user.update({ where: { id: created.userId }, data: { twoFactorEnabled: true } });
      admins.push(await accessOf(created.userId, undefined, own.organizationId));
    }
    const [first, second] = admins;
    if (!first || !second) throw new Error("no admins");
    let changes: Promise<unknown>[] = [];
    // Holding the organization row makes both writes wait. Both found it off; the one that gets the lock second finds
    // it already on, changes nothing and records nothing.
    await test.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organization WHERE id = ${own.organizationId}::uuid FOR UPDATE`;
      const holder = await backendPid(tx);
      changes = [first, second].map((admin) => {
        const change = test.identity.settings.setTwoFactorRequirement(admin, { required: true });
        change.catch(() => undefined);
        return change;
      });
      await waitUntilBlockedBy(test.database.client, holder, { count: 2 });
    });
    await Promise.all(changes);

    const final = await test.database.forOrg(own.organizationId, (tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: own.organizationId } }),
    );
    const entries = await test.database.forOrg(own.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: own.organizationId } }),
    );
    expect(final.requireTwoFactor).toBe(true);
    expect(entries).toEqual([
      expect.objectContaining({ before: { requireTwoFactor: false }, after: { requireTwoFactor: true } }),
    ]);
  });

  it("records nothing, in either organization, when an actor targets another organization's member", async () => {
    const other = await createTestAgency(test.identity, platform);
    const before = await test.database.forOrg(other.organizationId, (tx) => tx.auditEntry.count());
    await expect(test.identity.staff.remove(owner, { memberId: other.ownerMemberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      test.identity.staff.updateRole(owner, { memberId: other.ownerMemberId, roleKey: "sales" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await test.database.forOrg(other.organizationId, (tx) => tx.auditEntry.count())).toBe(before);
    expect(await staffEntriesAbout(other.ownerMemberId)).toEqual([]);
  });

  it("records the impersonation's expiry, so the log bounds it even if it ends by itself", async () => {
    const support = await signedInPlatformAdmin();
    const started = await post("/admin/impersonate-user", support.cookie, { userId: agency.ownerUserId });
    expect(started.status).toBe(200);
    const startedEntries = (await entriesAbout(agency.ownerMemberId)).filter(
      (entry) => entry.action === "support.impersonation-started" && entry.actorUserId === support.userId,
    );
    const expiresAt = (startedEntries[0]?.after as { expiresAt?: string } | null)?.expiresAt ?? "";
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(50 * 60 * 1000);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("records no stop when the request has no admin session to return to", async () => {
    const support = await signedInPlatformAdmin();
    const started = await post("/admin/impersonate-user", support.cookie, { userId: agency.ownerUserId });
    const withoutAdminCookie = cookiesAfter(support.cookie, started)
      .split("; ")
      .filter((pair) => !pair.includes("admin_session"))
      .join("; ");
    const stopped = await post("/admin/stop-impersonating", withoutAdminCookie, {});
    expect(stopped.status).not.toBe(200);
    const stops = (await entriesAbout(agency.ownerMemberId)).filter(
      (entry) => entry.action === "support.impersonation-stopped" && entry.actorUserId === support.userId,
    );
    expect(stops).toEqual([]);
  });

  it("ends the impersonation it just started when it can't write the entry", async () => {
    const support = await signedInPlatformAdmin();
    const flaky = Object.create(test.database) as typeof test.database;
    flaky.forOrg = () => Promise.reject(new Error("the audit log is down"));
    // Better Auth logs the failure it is about to report; the test expects it.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flakyAuth = createAuth(flaky, testAuthSettings);
    const started = await post(
      "/admin/impersonate-user",
      support.cookie,
      { userId: agency.ownerUserId },
      flakyAuth.handler,
    );
    logged.mockRestore();
    expect(started.status).toBe(500);
    const left = await test.database.client.session.count({
      where: { userId: agency.ownerUserId, impersonatedBy: support.userId },
    });
    expect(left).toBe(0);
  });
});
