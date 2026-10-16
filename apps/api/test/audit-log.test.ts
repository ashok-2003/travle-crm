// audit.list over HTTP (spec 9.5): the audit log viewer's one call. Newest first, a page at a time or one record's
// history, with each change's actor named by the api from the organization's own members: support as the member it
// signed in as, the platform team and the system by what they are, and nobody the organization can't see by name.
import type { AuditLogPage } from "@travel-crm/contracts/audit";
import { recordAudit, type AuditChange } from "@travel-crm/domain/audit";
import { platformActor, systemActor, type Actor } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStaff, createPlatformAdmin, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("audit.list", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** Records a change as the actor, the way a module does, in the actor's organization. */
  async function record(actor: Actor, change: AuditChange): Promise<void> {
    await server.db.forOrg(actor.organizationId, (tx) => recordAudit(tx, actor, change));
  }

  /** A member acting in the app. */
  const inApp = (agency: TestAgency, userId: string): Actor => ({
    organizationId: agency.organizationId,
    userId,
    source: "web",
    impersonatedBy: null,
  });

  /** One record's history, newest first, as the Owner reads it. */
  async function historyOf(agency: TestAgency, entityType: string, entityId: string) {
    const jar = await signedInOwner(server, agency);
    return dataOf<AuditLogPage>(await query(server, "audit.list", jar, { entityType, entityId }));
  }

  it("shows an Owner's change in the app with their name and the change's before and after, newest first", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await dataOf(await mutate(server, "roles.update", { key: "sales", name: "Sales team" }, jar));
    await dataOf(await mutate(server, "roles.update", { key: "sales", name: "Field sales" }, jar));

    const { entries } = await dataOf<AuditLogPage>(await query(server, "audit.list", jar, {}));
    expect(entries.filter((entry) => entry.action === "role.updated")).toEqual([
      expect.objectContaining({
        before: expect.objectContaining({ name: "Sales team" }) as unknown,
        after: expect.objectContaining({ name: "Field sales" }) as unknown,
      }),
      expect.objectContaining({
        source: "web",
        entityType: "role",
        actor: { kind: "member", name: "Asha Owner" },
        before: expect.objectContaining({ name: "Sales" }) as unknown,
        after: expect.objectContaining({ name: "Sales team" }) as unknown,
      }),
    ]);
    // Who acted is a name, never a user id: the viewer has no use for one, and a platform admin's is the platform's.
    expect(entries[0]).not.toHaveProperty("actorUserId");
    expect(entries[0]).not.toHaveProperty("impersonatedBy");
    const times = entries.map((entry) => entry.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("names support as the member it signed in as, and the platform team and the system by what they are", async () => {
    const agency = await createTestAgency(server);
    const admin = await createPlatformAdmin(server);
    const owner = agency.owner;
    const roleId = crypto.randomUUID();
    const change = (action: string): AuditChange => ({ action, entityType: "role", entityId: roleId });
    await record(
      {
        organizationId: agency.organizationId,
        userId: owner.userId,
        source: "impersonation",
        impersonatedBy: admin.userId,
      },
      change("role.updated"),
    );
    // Starting and stopping, the admin acts in their own name: both the actor and the impersonator.
    await record(
      {
        organizationId: agency.organizationId,
        userId: admin.userId,
        source: "impersonation",
        impersonatedBy: admin.userId,
      },
      change("support.impersonation-started"),
    );
    await record(platformActor(agency.organizationId, admin.userId), change("subscription.plan-changed"));
    await record(systemActor(agency.organizationId), change("subscription.status-changed"));

    expect((await historyOf(agency, "role", roleId)).entries.map(({ action, actor }) => ({ action, actor }))).toEqual([
      { action: "subscription.status-changed", actor: { kind: "system" } },
      { action: "subscription.plan-changed", actor: { kind: "platform" } },
      { action: "support.impersonation-started", actor: { kind: "support" } },
      { action: "role.updated", actor: { kind: "support-as-member", name: "Asha Owner" } },
    ]);
  });

  it("names nobody who has left the organization, or who was never one of its members", async () => {
    const agency = await createTestAgency(server);
    const other = await createTestAgency(server);
    const leaver = await addStaff(server, agency, { username: "leaver", roleKey: "org-admin" });
    const roleId = crypto.randomUUID();
    await record(inApp(agency, leaver.userId), { action: "role.updated", entityType: "role", entityId: roleId });
    await record(
      { ...inApp(agency, leaver.userId), source: "impersonation", impersonatedBy: crypto.randomUUID() },
      { action: "role.updated", entityType: "role", entityId: roleId },
    );
    // Recorded by a module that named someone of another organization: their name stays theirs.
    await record(inApp(agency, other.owner.userId), { action: "role.created", entityType: "role", entityId: roleId });
    expect((await historyOf(agency, "role", roleId)).entries.map((entry) => entry.actor)).toEqual([
      { kind: "member", name: null },
      { kind: "support-as-member", name: "leaver" },
      { kind: "member", name: "leaver" },
    ]);

    await dataOf(
      await mutate(server, "staff.remove", { memberId: leaver.memberId }, await signedInOwner(server, agency)),
    );
    expect((await historyOf(agency, "role", roleId)).entries.map((entry) => entry.actor)).toEqual([
      { kind: "member", name: null },
      { kind: "support-as-member", name: null },
      { kind: "member", name: null },
    ]);
  });

  it("gives a page at a time, the next one after the last entry of the page before", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const memberId = crypto.randomUUID();
    for (const action of ["staff.created", "staff.role-changed", "staff.removed"]) {
      await record(inApp(agency, agency.owner.userId), { action, entityType: "member", entityId: memberId });
    }
    const filter = { entityType: "member", entityId: memberId, limit: 2 };

    const first = await dataOf<AuditLogPage>(await query(server, "audit.list", jar, filter));
    expect(first.entries.map((entry) => entry.action)).toEqual(["staff.removed", "staff.role-changed"]);
    expect(first.nextCursor).toBe(first.entries[1]?.id);
    const second = await dataOf<AuditLogPage>(
      await query(server, "audit.list", jar, { ...filter, before: first.nextCursor }),
    );
    expect(second).toEqual({ entries: [expect.objectContaining({ action: "staff.created" })], nextCursor: null });
  });

  it("shows one record's history only, and wants both halves of the record", async () => {
    const agency = await createTestAgency(server);
    const other = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const [kept, ignored] = [crypto.randomUUID(), crypto.randomUUID()];
    await record(inApp(agency, agency.owner.userId), { action: "role.created", entityType: "role", entityId: kept });
    await record(inApp(agency, agency.owner.userId), { action: "role.created", entityType: "role", entityId: ignored });
    await record(inApp(other, other.owner.userId), { action: "role.deleted", entityType: "role", entityId: kept });

    // Another organization's entry about the same id stays in that organization (row-level security).
    expect((await historyOf(agency, "role", kept)).entries).toEqual([
      expect.objectContaining({ action: "role.created", entityId: kept }),
    ]);
    expect(await refusalOf(await query(server, "audit.list", jar, { entityType: "role" }))).toEqual({
      status: 400,
      reason: null,
    });
  });

  it("is for roles that may see the audit log: an Admin can, a salesperson can't", async () => {
    const agency = await createTestAgency(server);
    const admin = await addStaff(server, agency, { username: "admin", roleKey: "org-admin" });
    const sales = await addStaff(server, agency, { username: "sales", roleKey: "sales" });
    const adminAnswer = await query(server, "audit.list", await signedInStaff(server, agency, admin), {});
    expect((await dataOf<AuditLogPage>(adminAnswer)).entries.length).toBeGreaterThan(0);
    expect(await refusalOf(await query(server, "audit.list", await signedInStaff(server, agency, sales), {}))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });
});
