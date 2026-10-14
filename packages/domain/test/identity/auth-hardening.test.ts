// Better Auth's own endpoints, run through its real handler: the side doors that would let a member change their
// sign-in name into another organization's namespace, or reach the platform-admin endpoints (ADR 0006).
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import {
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
    const email = `admin-${crypto.randomUUID()}@example.test`;
    const user = await test.database.client.user.create({ data: { name: "Support", email, role: "admin" } });
    await test.database.client.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await (await test.identity.auth.$context).password.hash("admin-password-1"),
      },
    });
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

  it("refuses the admin endpoints to a user who has the admin role and also a membership", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: "admin" } });
    try {
      const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
      expect((await get("/admin/list-users", headers)).status).toBe(403);
    } finally {
      await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { role: null } });
    }
  });

  it("refuses the admin endpoints without a session", async () => {
    expect((await get("/admin/list-users", new Headers())).status).toBe(401);
  });

  it("lets a genuine platform admin use the admin endpoints", async () => {
    const headers = await platformAdminHeaders();
    expect((await get("/admin/list-users", headers)).status).toBe(200);
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

  async function expectRefusedAndUnchanged(response: Response, userId: string): Promise<void> {
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF" });
    const user = await test.database.client.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role ?? "").not.toMatch(/admin/);
  }

  it("refuses to make a member a platform admin, even a removed one", async () => {
    const headers = await platformAdminHeaders();
    const staff = await newMember("leaver");
    const makeAdmin = () => post("/admin/set-role", headers, { userId: staff.userId, role: "admin" });
    await expectRefusedAndUnchanged(await makeAdmin(), staff.userId);
    await test.database.client.member.update({ where: { id: staff.memberId }, data: softDeleted(agency.ownerUserId) });
    await expectRefusedAndUnchanged(await makeAdmin(), staff.userId);
  });

  it("refuses the set-role bypasses: array ids, comma-joined roles, role arrays and admin update-user", async () => {
    const headers = await platformAdminHeaders();
    const staff = await newMember("bypass");
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: [staff.userId], role: "admin" }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: "admin,user" }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: ["admin"] }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/update-user", headers, { userId: staff.userId, data: { role: "admin" } }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/set-role", headers, { userId: staff.userId, role: ["admin,user"] }),
      staff.userId,
    );
    await expectRefusedAndUnchanged(
      await post("/admin/update-user", headers, { userId: staff.userId, data: { role: "admin,user" } }),
      staff.userId,
    );
  });

  it("still lets a platform admin set a role on a person who has never been a member", async () => {
    const headers = await platformAdminHeaders();
    const outsider = await test.database.client.user.create({
      data: { name: "Outsider", email: `outsider-${crypto.randomUUID()}@example.test` },
    });
    const response = await post("/admin/set-role", headers, { userId: outsider.id, role: "admin" });
    expect(response.status).toBe(200);
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
    expect((await get("/admin/list-users", impersonating)).status).toBe(403);
    expect((await post("/admin/stop-impersonating", impersonating, {})).status).toBe(200);
  });
});
