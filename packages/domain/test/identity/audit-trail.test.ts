// Identity's changes leave an audit trail (spec 9.5): who added, changed or removed staff and roles, and changed the
// two-factor setting, recorded in the same transaction, and support's impersonation with the admin's name on it.
// A refused change, including one that lost a race to another, records nothing.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

describe("identity's audit trail", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  async function accessOf(
    userId: string,
    session?: { impersonatedBy: string | null },
    organizationId = agency.organizationId,
  ): Promise<MemberAccess> {
    const access = await test.identity.resolveAccess(userId, organizationId, session);
    if (!access) throw new Error("no access");
    return access;
  }

  /** Adds a member of the agency with the given role, as the Owner. */
  async function addStaff(username: string, roleKey: string) {
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

  /** The organization's entries about one record, oldest first. */
  async function entriesAbout(entityId: string) {
    return test.database.forOrg(agency.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    );
  }

  /** Better Auth's handler, as the api serves it at /api/auth. */
  function post(path: string, cookie: string, body: unknown): Promise<Response> {
    return test.identity.auth.handler(
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
    const email = `support-${crypto.randomUUID()}@example.test`;
    const user = await test.database.client.user.create({ data: { name: "Support", email, role: "admin" } });
    const password = await (await test.identity.auth.$context).password.hash("support-password-1");
    await test.database.client.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password },
    });
    const signIn = await post("/sign-in/email", "", { email, password: "support-password-1" });
    return { userId: user.id, cookie: cookiesAfter("", signIn) };
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
    expect(await entriesAbout(agency.ownerMemberId)).toEqual([
      expect.objectContaining({
        action: "staff.created",
        entityType: "member",
        actorUserId: null,
        source: "job",
        before: null,
        after: { name: "Asha Owner", username: null, role: "org-owner", hasEmail: true },
      }),
    ]);
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

    const entries = await entriesAbout(ravi.memberId);
    expect(entries.map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["staff.created", null, { name: "Ravi Kumar", username: "Ravi", role: "sales", hasEmail: true }],
      ["staff.role-changed", { role: "sales" }, { role: "operations" }],
      ["staff.password-reset", null, null],
      ["staff.removed", { name: "Ravi Kumar", role: "operations" }, null],
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ actorUserId: agency.ownerUserId, source: "web", impersonatedBy: null });
    }
    expect(JSON.stringify(entries)).not.toContain(email);
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
    expect((await entriesAbout(agency.ownerMemberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("records nothing for a change that lost a race to another (STAFF_CHANGED)", async () => {
    const admin = await accessOf((await addStaff("racing-admin", "org-admin")).userId);
    const target = await addStaff("raced", "sales");
    let change: Promise<unknown> = Promise.resolve();
    await test.database.client.$transaction(async (tx) => {
      // Holding the member row makes the Admin's write wait after it has read the old role; then someone moves them.
      await tx.$queryRaw`SELECT id FROM member WHERE id = ${target.memberId}::uuid FOR UPDATE`;
      change = test.identity.staff.updateRole(admin, { memberId: target.memberId, roleKey: "operations" });
      change.catch(() => undefined);
      await waitUntilBlockedAt('UPDATE "public"."member" SET');
      await tx.member.update({ where: { id: target.memberId }, data: { role: "accounts" } });
    });
    await expect(change).rejects.toMatchObject({ code: "CONFLICT", reason: "STAFF_CHANGED" });
    expect((await entriesAbout(target.memberId)).map((entry) => entry.action)).toEqual(["staff.created"]);
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
    const [firstRemoves] = await Promise.allSettled([
      test.identity.staff.remove(first, { memberId: second.memberId }),
      test.identity.staff.remove(second, { memberId: first.memberId }),
    ]);
    // The loser is refused with OWNER_ONLY once the winner commits (staff-removal.test.ts), and records nothing.
    const [winner, loser] = firstRemoves.status === "fulfilled" ? [first, second] : [second, first];
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
});
