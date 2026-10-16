// Platform staff (spec 6.1): a platform role and no organization. They reach the console, organization staff don't,
// and impersonation (at most an hour) makes the admin act as the user, never as platform staff, and never as a member
// with a step only they can take.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { consoleQuery, createTestConsole, signInPlatformStaffAgain, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createPlatformAdmin, ownerAccess, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";
import { enableTwoFactor } from "./support/two-factor.js";

// Two-factor is off in the product (@travel-crm/contracts/features): these tests prove what turning it on brings.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: true } }));

describe("platform staff", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;
  let admin: { userId: string; email: string; password: string; secret: string };

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
    const created = await createPlatformAdmin(server);
    // The console requires two-factor of platform staff (console-two-factor.test.ts).
    const jar = new CookieJar();
    await signInByEmail(server, jar, created.email, created.password);
    admin = { ...created, secret: (await enableTwoFactor(server, jar, created.password)).secret };
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("reach platform procedures, and organization staff don't", async () => {
    const jar = await signInPlatformStaffAgain(server, admin);
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      userId: admin.userId,
      name: "Platform support",
      level: "support",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).isPlatformAdmin).toBe(true);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
      reason: "PLATFORM_ONLY",
    });
  });

  it("are not organization members", async () => {
    const jar = await signInPlatformStaffAgain(server, admin);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("can impersonate a user for an hour, acting as them and not as platform staff", async () => {
    const jar = await signInPlatformStaffAgain(server, admin);
    const start = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(start.status).toBe(200);

    const me = await dataOf<MeOutput>(await query(server, "me.get", jar));
    expect(me).toMatchObject({ impersonatedBy: admin.userId, isPlatformAdmin: false });
    expect(me.user.id).toBe(agency.owner.userId);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await consoleQuery(testConsole, "whoAmI", jar)).status).toBe(403);
    const session = await server.platform.session.findFirstOrThrow({
      where: { userId: agency.owner.userId, impersonatedBy: admin.userId },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

    jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(admin.userId);
  });

  it("can't be impersonated into by organization staff", async () => {
    const owner = await signedInOwner(server, agency);
    const attempt = await postJson(server, "/api/auth/admin/impersonate-user", { userId: admin.userId }, owner);
    expect(attempt.status).toBe(403);
  });

  it("can't impersonate a member with a step to take first, which only they can (it needs their password)", async () => {
    const jar = await signInPlatformStaffAgain(server, admin);
    const impersonate = async (userId: string) =>
      jar.absorb(await postJson(server, "/api/auth/admin/impersonate-user", { userId }, jar));
    const refused = async (userId: string) => {
      const response = await impersonate(userId);
      return { status: response.status, code: ((await response.json()) as { code?: string }).code };
    };
    const pending = { status: 403, code: "TARGET_HAS_PENDING_STEP" };
    // Meera still has the temporary password she was added with.
    const meera = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Meera Iyer",
      email: `meera-${agency.code.toLowerCase()}@example.test`,
      roleKey: "operations",
      temporaryPassword: "meera-password-1",
    });
    expect(await refused(meera.userId)).toEqual(pending);
    // This organization requires two-factor, which its Owner hasn't set up.
    const strict = await createTestAgency(server);
    await server.platform.organization.update({
      where: { id: strict.organizationId },
      data: { requireTwoFactor: true },
    });
    expect(await refused(strict.owner.userId)).toEqual(pending);
    const targets = [meera.userId, strict.owner.userId];
    expect(
      await server.platform.session.count({ where: { impersonatedBy: admin.userId, userId: { in: targets } } }),
    ).toBe(0);

    // Once the step is taken, support may sign in as them.
    await server.platform.user.update({ where: { id: strict.owner.userId }, data: { twoFactorEnabled: true } });
    expect((await impersonate(strict.owner.userId)).status).toBe(200);
    jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
  });
});
