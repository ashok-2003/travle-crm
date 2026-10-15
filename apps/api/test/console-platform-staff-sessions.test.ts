// What a change to platform staff does to sessions. Removing someone ends their power at once: their own sessions and
// the impersonations they started are deleted, so their next console call and the impersonated member's next request
// are refused, and each ended impersonation is recorded in its organization's log; their user row stays, banned, and
// their address stays taken. Demoting a super admin keeps their impersonations (support may impersonate). A new
// temporary password signs them out everywhere, impersonations included.
import type { PlatformStaffEntry, TemporaryPasswordOutput } from "@travel-crm/contracts/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("platform staff's sessions", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  const change = (path: string, input: unknown) => consoleMutate(testConsole, path, input, superAdmin.jar);

  /** The staff member, signed in a second time, impersonating the agency's Owner. */
  async function impersonatingOwner(staff: TestPlatformStaff): Promise<CookieJar> {
    const jar = new CookieJar();
    await signInByEmail(server, jar, staff.email, staff.password);
    const start = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(start.status).toBe(200);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    return jar;
  }

  const impersonationsBy = (userId: string) => server.platform.session.count({ where: { impersonatedBy: userId } });

  /** The Owner's organization's log entries for impersonations by this admin that the console ended. */
  const stopsRecorded = (adminUserId: string) =>
    server.platform.auditEntry.findMany({
      where: {
        organizationId: agency.organizationId,
        action: "support.impersonation-stopped",
        after: { path: ["adminUserId"], equals: adminUserId },
      },
      select: { actorUserId: true, source: true, impersonatedBy: true, entityType: true, entityId: true, after: true },
    });

  /** What the Owner's organization reads when the console ended an impersonation by this admin, for this reason. */
  const stopEntry = (adminUserId: string, reason: string) => ({
    actorUserId: superAdmin.userId,
    source: "platform",
    impersonatedBy: null,
    entityType: "member",
    entityId: agency.owner.memberId,
    after: { userId: agency.owner.userId, adminUserId, expiresAt: expect.any(String) as string, reason },
  });

  it("removes support: their sessions and their impersonations end at once, recorded where they were", async () => {
    const leaving = await signedInPlatformStaff(server, "support");
    const impersonation = await impersonatingOwner(leaving);
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(200);

    expect((await change("platformStaff.remove", { userId: leaving.userId })).status).toBe(200);
    expect(await server.platform.session.count({ where: { userId: leaving.userId } })).toBe(0);
    expect(await impersonationsBy(leaving.userId)).toBe(0);
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(401);
    expect((await query(server, "settings.get", impersonation)).status).toBe(401);
    expect((await signInByEmail(server, new CookieJar(), leaving.email, leaving.password)).ok).toBe(false);
    expect(await stopsRecorded(leaving.userId)).toEqual([stopEntry(leaving.userId, "removed-from-platform-staff")]);
  });

  it("keeps a removed person's row, with no level, and their address taken, as any address in use is", async () => {
    const leaving = await signedInPlatformStaff(server, "support");
    expect((await change("platformStaff.remove", { userId: leaving.userId })).status).toBe(200);
    expect(
      await server.platform.user.findUniqueOrThrow({
        where: { id: leaving.userId },
        select: { email: true, role: true, banned: true, banReason: true },
      }),
    ).toEqual({ email: leaving.email, role: null, banned: true, banReason: "Removed from platform staff" });
    const staff = await dataOf<PlatformStaffEntry[]>(
      await consoleQuery(testConsole, "platformStaff.list", superAdmin.jar),
    );
    expect(staff.find((entry) => entry.userId === leaving.userId)).toMatchObject({
      level: null,
      removedAt: expect.any(String) as string,
    });
    for (const email of [leaving.email, superAdmin.email]) {
      expect(await refusalOf(await change("platformStaff.add", { name: "Again", email, level: "support" }))).toEqual({
        status: 409,
        reason: "STAFF_EMAIL_TAKEN",
      });
    }
    for (const [path, input] of [
      ["platformStaff.setLevel", { userId: leaving.userId, level: "support" }],
      ["platformStaff.resetPassword", { userId: leaving.userId }],
      ["platformStaff.remove", { userId: leaving.userId }],
    ] as const) {
      expect(await refusalOf(await change(path, input))).toEqual({ status: 404, reason: "STAFF_NOT_FOUND" });
    }
  });

  it("keeps a demoted super admin's impersonations, since support may impersonate", async () => {
    const demoted = await signedInPlatformStaff(server, "super-admin");
    const impersonation = await impersonatingOwner(demoted);
    expect((await change("platformStaff.setLevel", { userId: demoted.userId, level: "support" })).status).toBe(200);
    expect(await impersonationsBy(demoted.userId)).toBe(1);
    expect((await query(server, "settings.get", impersonation)).status).toBe(200);
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", demoted.jar))).toMatchObject({ level: "support" });
    expect(await stopsRecorded(demoted.userId)).toEqual([]);
  });

  it("sets a new temporary password, shown once, and signs them out everywhere, impersonations included", async () => {
    const forgetful = await signedInPlatformStaff(server, "support");
    const impersonation = await impersonatingOwner(forgetful);
    const { temporaryPassword } = await dataOf<TemporaryPasswordOutput>(
      await change("platformStaff.resetPassword", { userId: forgetful.userId }),
    );
    expect((await consoleQuery(testConsole, "whoAmI", forgetful.jar)).status).toBe(401);
    expect((await query(server, "settings.get", impersonation)).status).toBe(401);
    expect(await stopsRecorded(forgetful.userId)).toEqual([stopEntry(forgetful.userId, "password-reset")]);
    expect((await signInByEmail(server, new CookieJar(), forgetful.email, forgetful.password)).ok).toBe(false);
    const jar = new CookieJar();
    expect((await signInByEmail(server, jar, forgetful.email, temporaryPassword)).status).toBe(200);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
  });
});
