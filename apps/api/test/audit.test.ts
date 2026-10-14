// The audit log through the HTTP app (spec 9.5): changes made in the web app are recorded with their source, and
// support's impersonation is recorded, with every change made during it carrying the admin's id (ADR 0006).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, createPlatformAdmin, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, refusalOf } from "./support/trpc.js";

describe("the audit log", () => {
  let server: TestServer;
  let agency: TestAgency;

  /** The organization's entries, oldest first. The platform client reads them; the api has no audit router yet. */
  async function entriesOf(organizationId: string, where: { entityId?: string; action?: string } = {}) {
    return server.platform.auditEntry.findMany({
      where: { organizationId, ...where },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
  }

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("records an Owner removing staff in the web app", async () => {
    const leaver = await addStaff(server, agency, { username: "leaver", roleKey: "sales" });
    await dataOf(
      await mutate(server, "staff.remove", { memberId: leaver.memberId }, await signedInOwner(server, agency)),
    );

    expect(await entriesOf(agency.organizationId, { entityId: leaver.memberId, action: "staff.removed" })).toEqual([
      expect.objectContaining({
        actorUserId: agency.owner.userId,
        source: "web",
        impersonatedBy: null,
        entityType: "member",
        before: { role: "sales" },
      }),
    ]);
  });

  it("records nothing when a change is refused", async () => {
    const sales = await addStaff(server, agency, { username: "seller", roleKey: "sales" });
    const target = await addStaff(server, agency, { username: "target", roleKey: "sales" });
    const attempt = await mutate(
      server,
      "staff.remove",
      { memberId: target.memberId },
      await signedInStaff(server, agency, sales),
    );
    expect(await refusalOf(attempt)).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(await entriesOf(agency.organizationId, { entityId: target.memberId, action: "staff.removed" })).toEqual([]);
  });

  it("records support impersonating the Owner, and what they change meanwhile, with the admin's id", async () => {
    const admin = await createPlatformAdmin(server);
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    const started = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(started.status).toBe(200);
    await dataOf(await mutate(server, "roles.update", { key: "sales", name: "Sales team" }, jar));
    const stopped = jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
    expect(stopped.status).toBe(200);

    const [roleChange] = await entriesOf(agency.organizationId, { action: "role.updated" });
    expect(roleChange).toMatchObject({
      actorUserId: agency.owner.userId,
      source: "impersonation",
      impersonatedBy: admin.userId,
      before: { name: "Sales" },
      after: { name: "Sales team" },
    });
    const impersonation = await entriesOf(agency.organizationId, { entityId: agency.owner.memberId });
    expect(impersonation.filter((entry) => entry.action.startsWith("support."))).toEqual([
      expect.objectContaining({
        action: "support.impersonation-started",
        actorUserId: admin.userId,
        source: "impersonation",
        impersonatedBy: admin.userId,
      }),
      expect.objectContaining({ action: "support.impersonation-stopped", actorUserId: admin.userId }),
    ]);
  });
});
