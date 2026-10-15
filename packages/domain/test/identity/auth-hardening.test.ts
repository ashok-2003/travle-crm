// Better Auth's own endpoints, run through its real handler: the side doors that would let a member change their
// sign-in name into another organization's namespace, or reach the platform-admin endpoints (ADR 0006), which stay
// open over HTTP only for support's impersonation, of an organization's active staff (ADR 0018).
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import {
  createPlatformAdmin,
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("Better Auth hardening", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let ownerHeaders: Headers;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    ownerHeaders = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  function post(path: string, headers: Headers, body: unknown): Promise<Response> {
    const request = new Request(`http://localhost/api/auth${path}`, {
      method: "POST",
      headers: { cookie: headers.get("cookie") ?? "", origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return test.identity.auth.handler(request);
  }

  function get(path: string, headers: Headers): Promise<Response> {
    return test.identity.auth.handler(
      new Request(`http://localhost/api/auth${path}`, { headers: { cookie: headers.get("cookie") ?? "" } }),
    );
  }

  async function platformAdminHeaders(): Promise<Headers> {
    const { email } = await createPlatformAdmin(test, "admin-password-1");
    return signInByEmail(test.identity, email, "admin-password-1");
  }

  /** A super admin's: support may only impersonate, even from the server (platform-staff-powers.test.ts). */
  async function superAdminHeaders(): Promise<Headers> {
    const { userId, email } = await createPlatformAdmin(test, "admin-password-1");
    await test.database.client.user.update({ where: { id: userId }, data: { role: "super-admin" } });
    return signInByEmail(test.identity, email, "admin-password-1");
  }

  it("refuses a member changing their username or display name, and changes nothing", async () => {
    const before = await test.database.client.user.findUniqueOrThrow({ where: { id: agency.ownerUserId } });
    const username = await post("/update-user", ownerHeaders, { username: "othercode:ravi" });
    const displayName = await post("/update-user", ownerHeaders, { displayUsername: "Ravi" });
    expect(username.status).toBe(403);
    expect(displayName.status).toBe(403);
    expect(await username.json()).toMatchObject({ code: "USERNAME_CHANGES_NOT_ALLOWED" });
    const after = await test.database.client.user.findUniqueOrThrow({ where: { id: agency.ownerUserId } });
    expect({ username: after.username, displayUsername: after.displayUsername }).toEqual({
      username: before.username,
      displayUsername: before.displayUsername,
    });
  });

  it("still lets a member change their name", async () => {
    const response = await post("/update-user", ownerHeaders, { name: "Asha Renamed" });
    expect(response.status).toBe(200);
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: agency.ownerUserId } });
    expect(user.name).toBe("Asha Renamed");
  });

  it("closes the username availability check", async () => {
    const response = await post("/is-username-available", new Headers(), { username: "anything:name" });
    expect(response.status).toBe(404);
  });

  /** A server-side call's refusal: its HTTP status and code, or "allowed". */
  async function refusalOf(call: Promise<unknown>): Promise<string> {
    try {
      await call;
      return "allowed";
    } catch (error) {
      const { status, body } = error as { status: string; body?: { code?: string } };
      return `${status} ${body?.code ?? ""}`.trim();
    }
  }

  const listUsers = (headers: Headers) => test.identity.auth.api.listUsers({ headers, query: {} });

  it("closes every admin endpoint over HTTP but starting and stopping impersonation, even to platform staff", async () => {
    const headers = await platformAdminHeaders();
    for (const path of ["/admin/list-users", "/admin/get-user?id=x"]) {
      expect((await get(path, headers)).status, path).toBe(404);
    }
    for (const path of [
      "/admin/create-user",
      "/admin/set-role",
      "/admin/update-user",
      "/admin/ban-user",
      "/admin/unban-user",
      "/admin/remove-user",
      "/admin/set-user-password",
      "/admin/list-user-sessions",
      "/admin/revoke-user-session",
      "/admin/revoke-user-sessions",
      "/admin/has-permission",
    ]) {
      expect((await post(path, headers, { userId: agency.ownerUserId })).status, path).toBe(404);
    }
    const user = await test.database.client.user.findUnique({ where: { id: agency.ownerUserId } });
    expect(user?.banned).toBe(false);
  });

  it("refuses the admin endpoints, from server-side calls too, to a user who has the admin role and a membership", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: "admin" } });
    try {
      const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
      expect(await refusalOf(listUsers(headers))).toBe("FORBIDDEN FORBIDDEN");
    } finally {
      await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: null } });
    }
  });

  it("refuses the admin endpoints without a session", async () => {
    expect(await refusalOf(listUsers(new Headers()))).toBe("UNAUTHORIZED UNAUTHORIZED");
  });

  it("lets a genuine super admin call the admin endpoints from the server", async () => {
    expect(await refusalOf(listUsers(await superAdminHeaders()))).toBe("allowed");
  });

  async function newMember(username: string) {
    const staff = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: username,
      username,
      roleKey: "sales",
      password: `${username}-password-1`,
      mustChangePassword: false,
    });
    const member = await test.database.client.member.findFirstOrThrow({ where: { userId: staff.userId } });
    return { userId: staff.userId, memberId: member.id };
  }

  async function expectRefusedAndUnchanged(call: Promise<unknown>, userId: string): Promise<void> {
    expect(await refusalOf(call)).toBe("FORBIDDEN MEMBERS_CANNOT_BE_PLATFORM_STAFF");
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role ?? "").not.toMatch(/admin/);
  }

  /** Better Auth's admin endpoints as a server-side call makes them, with any body, as a careless caller might. */
  const adminCall = (path: "setRole" | "adminUpdateUser", headers: Headers, body: unknown) =>
    (test.identity.auth.api[path] as (request: { headers: Headers; body: unknown }) => Promise<unknown>)({
      headers,
      body,
    });

  it("refuses to make a member a platform admin, even a removed one", async () => {
    const headers = await platformAdminHeaders();
    const staff = await newMember("leaver");
    const makeAdmin = () => adminCall("setRole", headers, { userId: staff.userId, role: "admin" });
    await expectRefusedAndUnchanged(makeAdmin(), staff.userId);
    await test.database.client.member.update({ where: { id: staff.memberId }, data: softDeleted(agency.ownerUserId) });
    await expectRefusedAndUnchanged(makeAdmin(), staff.userId);
  });

  it("refuses the set-role bypasses: array ids, comma-joined roles, role arrays and admin update-user", async () => {
    const headers = await platformAdminHeaders();
    const staff = await newMember("bypass");
    for (const [path, body] of [
      ["setRole", { userId: [staff.userId], role: "admin" }],
      ["setRole", { userId: staff.userId, role: "admin,user" }],
      ["setRole", { userId: staff.userId, role: ["admin"] }],
      ["setRole", { userId: staff.userId, role: "super-admin" }],
      ["adminUpdateUser", { userId: staff.userId, data: { role: "admin" } }],
      ["setRole", { userId: staff.userId, role: ["admin,user"] }],
      ["adminUpdateUser", { userId: staff.userId, data: { role: "admin,user" } }],
    ] as const) {
      await expectRefusedAndUnchanged(adminCall(path, headers, body), staff.userId);
    }
  });

  it("still lets a super admin set a role on a person who has never been a member", async () => {
    const headers = await superAdminHeaders();
    const outsider = await test.database.client.user.create({
      data: { name: "Outsider", email: `outsider-${crypto.randomUUID()}@example.test` },
    });
    expect(await refusalOf(adminCall("setRole", headers, { userId: outsider.id, role: "admin" }))).toBe("allowed");
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: outsider.id } });
    expect(user.role).toBe("admin");
    await test.database.client.user.update({ where: { id: outsider.id }, data: { role: null } });
  });

  it("does not treat a removed member whose role was set to admin as platform staff", async () => {
    const staff = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Gone",
      username: "gone",
      roleKey: "sales",
      password: "gone-password-1",
      mustChangePassword: false,
    });
    const member = await test.database.client.member.findFirstOrThrow({ where: { userId: staff.userId } });
    await test.database.client.member.update({ where: { id: member.id }, data: softDeleted(agency.ownerUserId) });
    await test.database.client.user.update({ where: { id: staff.userId }, data: { role: "admin" } });
    expect(await test.identity.isPlatformAdmin({ id: staff.userId })).toBe(false);
  });

  it("refuses a password change that keeps the same password", async () => {
    const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
    const response = await post("/change-password", headers, {
      currentPassword: agency.ownerPassword,
      newPassword: agency.ownerPassword,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "NEW_PASSWORD_MUST_DIFFER" });
  });

  it("lets a platform admin stop impersonating, and refuses stop-impersonating without impersonation", async () => {
    const adminHeaders = await platformAdminHeaders();
    const adminUserId = (await test.identity.auth.api.getSession({ headers: adminHeaders }))?.user.id;
    const impersonation = await post("/admin/impersonate-user", adminHeaders, { userId: agency.ownerUserId });
    expect(impersonation.status).toBe(200);
    // A small cookie jar where the later value wins, and an empty value or Max-Age=0 deletes, as in a browser.
    const jar = new Map<string, string>();
    const keep = (cookies: string[]) => {
      for (const setCookie of cookies) {
        const [pair = "", ...attributes] = setCookie.split(";").map((part) => part.trim());
        const [name = "", ...value] = pair.split("=");
        if (value.join("") === "" || attributes.includes("Max-Age=0")) jar.delete(name);
        else jar.set(name, value.join("="));
      }
    };
    keep((adminHeaders.get("cookie") ?? "").split("; "));
    keep(impersonation.headers.getSetCookie());
    const cookies = () => new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") });
    const during = await test.identity.auth.api.getSession({ headers: cookies() });
    expect(during?.user.id).toBe(agency.ownerUserId);
    const stopped = await post("/admin/stop-impersonating", cookies(), {});
    expect(stopped.status).toBe(200);
    keep(stopped.headers.getSetCookie());
    const after = await test.identity.auth.api.getSession({ headers: cookies() });
    expect(after?.user.id).toBe(adminUserId);

    const member = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
    expect((await post("/admin/stop-impersonating", member, {})).status).toBe(403);
  });

  it("refuses a new password that only looks different after Unicode normalization", async () => {
    const realHash = async (password: string) => (await test.identity.auth.$context).password.hash(password);
    const email = `temp-${crypto.randomUUID()}@example.test`;
    const staff = await createStaffAccount(test.database, realHash, {
      organizationId: agency.organizationId,
      name: "Temp",
      email,
      roleKey: "sales",
      password: "temp-password-1",
      mustChangePassword: true,
    });
    const headers = await signInByEmail(test.identity, email, "temp-password-1");
    const response = await post("/change-password", headers, {
      currentPassword: "temp-password-1",
      newPassword: "temp-password-\uFF11",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "NEW_PASSWORD_MUST_DIFFER" });
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(user.mustChangePassword).toBe(true);
  });

  it("keeps the other admin endpoints closed during impersonation", async () => {
    const adminHeaders = await platformAdminHeaders();
    const impersonation = await post("/admin/impersonate-user", adminHeaders, { userId: agency.ownerUserId });
    expect(impersonation.status).toBe(200);
    const jar = new Map<string, string>();
    for (const pair of (adminHeaders.get("cookie") ?? "").split("; ")) jar.set(pair.split("=")[0] ?? "", pair);
    for (const setCookie of impersonation.headers.getSetCookie()) {
      const pair = setCookie.split(";")[0] ?? "";
      jar.set(pair.split("=")[0] ?? "", pair);
    }
    const impersonating = new Headers({ cookie: [...jar.values()].join("; ") });
    expect((await get("/admin/list-users", impersonating)).status).toBe(404);
    expect(await refusalOf(listUsers(impersonating))).toBe("FORBIDDEN FORBIDDEN");
    expect((await post("/admin/stop-impersonating", impersonating, {})).status).toBe(200);
  });
  it("impersonates only an organization's active staff", async () => {
    const headers = await platformAdminHeaders();
    const impersonate = (userId: string) => post("/admin/impersonate-user", headers, { userId });
    const outsider = await test.database.client.user.create({
      data: { name: "Outsider", email: `never-member-${crypto.randomUUID()}@example.test` },
    });
    const leaver = await newMember("removed-one");
    await test.database.client.member.update({ where: { id: leaver.memberId }, data: softDeleted(agency.ownerUserId) });
    const banned = await newMember("banned-one");
    await test.database.client.user.update({ where: { id: banned.userId }, data: { banned: true } });
    for (const userId of [outsider.id, leaver.userId, banned.userId, crypto.randomUUID()]) {
      const refused = await impersonate(userId);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "IMPERSONATION_TARGET_NOT_A_MEMBER" });
    }
    expect(
      await test.database.client.session.count({ where: { impersonatedBy: { not: null }, userId: leaver.userId } }),
    ).toBe(0);
    expect((await impersonate((await newMember("present-one")).userId)).status).toBe(200);
  });

  it("refuses a cross-site browser request to the username sign-in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const request = (site: string) =>
      test.identity.auth.handler(
        new Request("http://localhost/api/auth/sign-in/username", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost", "sec-fetch-site": site },
          body: JSON.stringify({ username: "nosuch:nobody", password: "wrong-password-1" }),
        }),
      );
    expect((await request("cross-site")).status).toBe(403);
    expect((await request("same-origin")).status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));
  });

  it("closes the organization endpoints over HTTP, but not to server-side calls", async () => {
    const response = await post("/organization/update-member-role", ownerHeaders, { memberId: "x", role: "x" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    expect((await get("/organization/list", ownerHeaders)).status).toBe(404);
    // No request, so no refusal from this hook: later plans may call the organization API from the server.
    await expect(test.identity.auth.api.listOrganizations({ headers: ownerHeaders })).resolves.toBeDefined();
  });

  it("never signs in by a placeholder .invalid email, and answers it exactly like a wrong password", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const realHash = async (password: string) => (await test.identity.auth.$context).password.hash(password);
    const email = `placeholder-${crypto.randomUUID()}@staff.invalid`;
    await createStaffAccount(test.database, realHash, {
      organizationId: agency.organizationId,
      name: "Placeholder",
      email,
      roleKey: "sales",
      password: "placeholder-password-1",
      mustChangePassword: false,
    });
    const attempt = (address: string, password: string) =>
      post("/sign-in/email", new Headers(), { email: address, password });
    const wrong = await attempt(agency.ownerEmail, "wrong-password-1");
    expect(wrong.status).toBe(401);
    const expected = await wrong.json();
    expect(expected).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
    // The right password still fails, in any letter case; the answer is the one a wrong password gets.
    for (const address of [email, email.toUpperCase()]) {
      const response = await attempt(address, "placeholder-password-1");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(expected);
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid password"));
  });
});
