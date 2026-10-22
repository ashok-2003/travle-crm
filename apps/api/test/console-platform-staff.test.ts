// Managing platform staff from the console (spec 5, 6.1), super admins only. A newcomer gets a temporary password,
// shown once, and must replace it and turn on two-factor before the console lets them in; nobody who is or was a
// member of an organization can become staff; and the platform log records each change by ids and levels, never a
// name, an address or a temporary password, which appears nowhere but in its one response.
import type { AddedPlatformStaff, PlatformStaffEntry, TemporaryPasswordOutput } from "@travel-crm/contracts/platform";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { problemLogger } from "./support/problem-logger.js";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { ownerAccess } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";
import { enableTwoFactor } from "./support/two-factor.js";

// Two-factor is off in the product (@travel-crm/contracts/features): these tests prove what turning it on brings.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: true } }));

const newAddress = (who: string) => `${who}-${crypto.randomUUID()}@platform.test`;

describe("managing platform staff", () => {
  let server: TestServer;
  let jobs: PgBossJobs;
  const pgBossLines: string[] = [];
  let testConsole: TestConsole;
  let agency: TestAgency;
  let superAdmin: TestPlatformStaff;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    // pg-boss for real, so a job that carried a temporary password would be found in its tables.
    jobs = createPgBossJobs({ connectionString: server.urls.runtime, logger: problemLogger(pgBossLines) });
    await jobs.start();
    testConsole = createTestConsole(server, { queue: jobs, jobs });
    agency = await createTestAgency(server);
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    support = await signedInPlatformStaff(server, "support");
  });

  afterAll(async () => {
    await testConsole.close();
    await jobs.stop();
    await server.close();
  });

  const add = (input: { name: string; email: string; level: string }) =>
    consoleMutate(testConsole, "platformStaff.add", input, superAdmin.jar);
  const setLevel = (userId: string, level: string) =>
    consoleMutate(testConsole, "platformStaff.setLevel", { userId, level }, superAdmin.jar);
  const list = async () =>
    dataOf<PlatformStaffEntry[]>(await consoleQuery(testConsole, "platformStaff.list", superAdmin.jar));
  const listed = async (userId: string) => (await list()).find((entry) => entry.userId === userId);

  it("adds support with a temporary password, which they replace, and two-factor on, before the console lets them in", async () => {
    const email = newAddress("newcomer");
    const added = await dataOf<AddedPlatformStaff>(await add({ name: "New support", email, level: "support" }));
    const jar = new CookieJar();
    expect((await signInByEmail(server, jar, email, added.temporaryPassword)).status).toBe(200);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    expect(await listed(added.userId)).toEqual({
      userId: added.userId,
      name: "New support",
      email,
      level: "support",
      mustChangePassword: true,
      twoFactorEnabled: false,
      createdAt: expect.any(String) as string,
      removedAt: null,
    });
    const change = { currentPassword: added.temporaryPassword, newPassword: "a-password-of-their-own" };
    expect(jar.absorb(await postJson(server, "/api/auth/change-password", change, jar)).status).toBe(200);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
    await enableTwoFactor(server, jar, change.newPassword);
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      userId: added.userId,
      name: "New support",
      level: "support",
    });
    expect(await listed(added.userId)).toMatchObject({ mustChangePassword: false, twoFactorEnabled: true });
  });

  it("lets only a super admin see or change platform staff: support sees itself through whoAmI", async () => {
    const someone = { userId: superAdmin.userId };
    const changes: [string, unknown][] = [
      ["platformStaff.add", { name: "Sneaky", email: newAddress("sneaky"), level: "super-admin" }],
      ["platformStaff.setLevel", { userId: support.userId, level: "super-admin" }],
      ["platformStaff.remove", someone],
      ["platformStaff.resetPassword", someone],
    ];
    for (const [path, input] of changes) {
      expect(await refusalOf(await consoleMutate(testConsole, path, input, support.jar))).toEqual({
        status: 403,
        reason: "SUPER_ADMIN_ONLY",
      });
    }
    expect(await refusalOf(await consoleQuery(testConsole, "platformStaff.list", support.jar))).toEqual({
      status: 403,
      reason: "SUPER_ADMIN_ONLY",
    });
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", support.jar))).toMatchObject({ level: "support" });
  });

  it("never makes staff of a member, a removed member, or a former member coming back by their address", async () => {
    const memberRefusal = { status: 409, reason: "EVER_A_MEMBER" };
    expect(await refusalOf(await add({ name: "Asha", email: agency.owner.email, level: "support" }))).toEqual(
      memberRefusal,
    );
    expect(await refusalOf(await setLevel(agency.owner.userId, "super-admin"))).toEqual(memberRefusal);

    const owner = await ownerAccess(server, agency);
    const leaverEmail = newAddress("leaver");
    const leaver = await server.identity.staff.create(owner, {
      name: "Leaver",
      email: leaverEmail,
      roleKey: "sales",
      temporaryPassword: "leaver-password-1",
    });
    await server.identity.staff.remove(owner, { memberId: leaver.memberId });
    expect(await refusalOf(await setLevel(leaver.userId, "support"))).toEqual(memberRefusal);
    expect(await refusalOf(await add({ name: "Leaver", email: leaverEmail, level: "support" }))).toEqual(memberRefusal);

    const roles = await server.platform.user.findMany({
      where: { OR: [{ email: { in: [agency.owner.email, leaverEmail] } }, { id: leaver.userId }] },
      select: { role: true },
    });
    expect(roles.map((user) => user.role)).toEqual([null, null]);
  });

  it("records each change by ids and levels, never a name or an address", async () => {
    const email = newAddress("recorded");
    const { userId } = await dataOf<AddedPlatformStaff>(
      await add({ name: "Recorded Person", email, level: "support" }),
    );
    expect((await setLevel(userId, "super-admin")).status).toBe(200);
    expect((await consoleMutate(testConsole, "platformStaff.resetPassword", { userId }, superAdmin.jar)).status).toBe(
      200,
    );
    expect((await consoleMutate(testConsole, "platformStaff.remove", { userId }, superAdmin.jar)).status).toBe(200);

    const entries = await server.platform.platformAuditEntry.findMany({
      where: { targetId: userId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      omit: { id: true, occurredAt: true },
    });
    const by = { actorUserId: superAdmin.userId, targetType: "platform_staff", targetId: userId };
    const noOrganization = { ...by, targetOrganizationId: null };
    expect(entries).toEqual([
      { ...noOrganization, action: "platform-staff.added", before: null, after: { level: "support" } },
      {
        ...noOrganization,
        action: "platform-staff.level-changed",
        before: { level: "support" },
        after: { level: "super-admin" },
      },
      { ...noOrganization, action: "platform-staff.password-reset", before: null, after: null },
      { ...noOrganization, action: "platform-staff.removed", before: { level: "super-admin" }, after: null },
    ]);
    expect(JSON.stringify(entries)).not.toContain("Recorded");
    expect(JSON.stringify(entries)).not.toContain(email);
  });

  it("shows a temporary password in its response only: not in the platform log, the console's log or pg-boss", async () => {
    const added = await dataOf<AddedPlatformStaff>(
      await add({ name: "Secret keeper", email: newAddress("secret"), level: "support" }),
    );
    const reset = await dataOf<TemporaryPasswordOutput>(
      await consoleMutate(testConsole, "platformStaff.resetPassword", { userId: added.userId }, superAdmin.jar),
    );
    expect(reset.temporaryPassword).not.toBe(added.temporaryPassword);
    for (const secret of [added.temporaryPassword, reset.temporaryPassword]) {
      const [platformLog] = await server.platform.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM platform_audit_entry e WHERE strpos(row_to_json(e)::text, ${secret}) > 0`;
      const [outbox] = await server.platform.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM outbox_event e WHERE strpos(row_to_json(e)::text, ${secret}) > 0`;
      const [pgBoss] = await server.db.withoutOrg(
        (tx) => tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pgboss.job j WHERE strpos(row_to_json(j)::text, ${secret}) > 0`,
      );
      expect({ platformLog: platformLog?.n, outbox: outbox?.n, pgBoss: pgBoss?.n }).toEqual({
        platformLog: 0,
        outbox: 0,
        pgBoss: 0,
      });
    }
    expect(testConsole.lines).toEqual([]);
    expect(pgBossLines).toEqual([]);
  });
});
