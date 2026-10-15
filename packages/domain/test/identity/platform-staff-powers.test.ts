// What platform staff may do through Better Auth's admin plugin: support only impersonates, and only once any
// temporary password is replaced, as the console requires too; a super admin keeps the plugin's other powers, which
// the side doors still limit (ADR 0019). Server-side auth.api.* calls carry no request, so Better Auth's own role
// check is what binds them.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("platform staff's powers in Better Auth", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let agency: TestAgency;

  beforeAll(async () => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  /** Platform staff at this Better Auth role, never a member, signed in by email, then with two-factor on. */
  async function signedInStaff(role: "admin" | "super-admin", mustChangePassword = false) {
    const email = `staff-${crypto.randomUUID()}@platform.test`;
    const user = await platform.user.create({ data: { name: "Platform person", email, role, mustChangePassword } });
    const hash = await (await test.identity.auth.$context).password.hash("platform-password-1");
    await platform.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
    const headers = await signInByEmail(test.identity, email, "platform-password-1");
    await platform.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    return { userId: user.id, headers };
  }

  /** Starts an impersonation over HTTP, as the console does. */
  function impersonate(headers: Headers, userId: string): Promise<Response> {
    return test.identity.auth.handler(
      new Request("http://localhost/api/auth/admin/impersonate-user", {
        method: "POST",
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId }),
      }),
    );
  }

  /** A server-side call's refusal as "<status> <code>", or "allowed". */
  async function outcomeOf(call: () => Promise<unknown>): Promise<string> {
    try {
      await call();
      return "allowed";
    } catch (error) {
      const { status, body } = error as { status: string; body?: { code?: string } };
      return `${status} ${body?.code ?? ""}`.trim();
    }
  }

  it("refuses impersonation while the admin still has a temporary password, and allows it once replaced", async () => {
    const newcomer = await signedInStaff("admin", true);
    const refused = await impersonate(newcomer.headers, agency.ownerUserId);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CHANGE_PASSWORD" });
    expect(await platform.session.count({ where: { impersonatedBy: newcomer.userId } })).toBe(0);
    await platform.user.update({ where: { id: newcomer.userId }, data: { mustChangePassword: false } });
    expect((await impersonate(newcomer.headers, agency.ownerUserId)).status).toBe(200);
  });

  it("gives support no admin power but impersonation, from server-side calls too", async () => {
    const support = await signedInStaff("admin");
    const superAdmin = await signedInStaff("super-admin");
    const { api } = test.identity.auth;
    const { headers } = support;
    // Promoting themselves, or taking over, removing or banning a super admin.
    expect(await outcomeOf(() => api.setRole({ headers, body: { userId: support.userId, role: "super-admin" } }))).toBe(
      "FORBIDDEN YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE",
    );
    expect(
      await outcomeOf(() =>
        api.setUserPassword({ headers, body: { userId: superAdmin.userId, newPassword: "taken-over-password-1" } }),
      ),
    ).toMatch(/^FORBIDDEN /);
    expect(await outcomeOf(() => api.removeUser({ headers, body: { userId: superAdmin.userId } }))).toMatch(
      /^FORBIDDEN /,
    );
    expect(await outcomeOf(() => api.banUser({ headers, body: { userId: superAdmin.userId } }))).toMatch(/^FORBIDDEN /);
    expect(await outcomeOf(() => api.listUsers({ headers, query: {} }))).toMatch(/^FORBIDDEN /);
    expect(await platform.user.findUniqueOrThrow({ where: { id: support.userId } })).toMatchObject({ role: "admin" });
    expect(await platform.user.findUniqueOrThrow({ where: { id: superAdmin.userId } })).toMatchObject({
      banned: false,
    });
    // A super admin keeps them; the side doors still refuse what our rules don't allow.
    expect(await outcomeOf(() => api.listUsers({ headers: superAdmin.headers, query: {} }))).toBe("allowed");
  });
});
