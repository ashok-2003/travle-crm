// Two-factor off (@travel-crm/contracts/features, the owner's 2026-10-16 ruling), through the HTTP apps: nobody is
// asked for a code, even a person whose row says two-factor is on; /api/auth/two-factor/* doesn't exist; platform
// staff reach the console and impersonate with a password alone, a newcomer straight after replacing the temporary
// one; and an organization whose row requires two-factor holds nobody back, while the requirement can't be changed.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { consoleQuery, createTestConsole, signedInPlatformStaff, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

// Off, as the product ships it, whatever the constant says today: these tests prove what the switch turns off.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: false } }));

describe("two-factor off", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("signs in a person whose row says two-factor is on with the password alone, by organization code", async () => {
    const meera = await addStaff(server, agency, { username: "meera", roleKey: "operations" });
    // As finishing the setup screen left it while two-factor was on.
    await server.platform.user.update({ where: { id: meera.userId }, data: { twoFactorEnabled: true } });
    await server.platform.twoFactor.create({ data: { userId: meera.userId, secret: "stored", backupCodes: "stored" } });

    const jar = new CookieJar();
    const signedIn = await signInWithCode(server, jar, {
      orgCode: agency.code,
      username: "meera",
      password: meera.password,
    });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).not.toHaveProperty("twoFactorRedirect");
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(meera.userId);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
  });

  it("has no two-factor endpoints", async () => {
    const owner = await signedInOwner(server, agency);
    const enable = await postJson(server, "/api/auth/two-factor/enable", { password: agency.owner.password }, owner);
    expect(enable.status).toBe(404);
    expect((await postJson(server, "/api/auth/two-factor/verify-totp", { code: "123456" }, owner)).status).toBe(404);
  });

  it("lets platform staff into the console with a password alone, at either level", async () => {
    const support = await signedInPlatformStaff(server, "support", { twoFactor: false });
    expect((await consoleQuery(testConsole, "whoAmI", support.jar)).status).toBe(200);
    const superAdmin = await signedInPlatformStaff(server, "super-admin", { twoFactor: false });
    expect((await consoleQuery(testConsole, "platformStaff.list", superAdmin.jar)).status).toBe(200);
  });

  it("takes a newcomer from the temporary password straight to the console", async () => {
    const newcomer = await signedInPlatformStaff(server, "support", { mustChangePassword: true, twoFactor: false });
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", newcomer.jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    const change = { currentPassword: newcomer.password, newPassword: "their-own-password-1" };
    expect(newcomer.jar.absorb(await postJson(server, "/api/auth/change-password", change, newcomer.jar)).status).toBe(
      200,
    );
    expect((await consoleQuery(testConsole, "whoAmI", newcomer.jar)).status).toBe(200);
  });

  it("lets support impersonate a member with a password alone", async () => {
    const support = await signedInPlatformStaff(server, "support", { twoFactor: false });
    const started = await postJson(
      server,
      "/api/auth/admin/impersonate-user",
      { userId: agency.owner.userId },
      support.jar,
    );
    expect(support.jar.absorb(started).status).toBe(200);
    expect((await dataOf<MeOutput>(await query(server, "me.get", support.jar))).impersonatedBy).toBe(support.userId);
  });

  it("holds nobody back where the organization's row requires two-factor, and won't change it", async () => {
    const required = await createTestAgency(server);
    await server.platform.organization.update({
      where: { id: required.organizationId },
      data: { requireTwoFactor: true },
    });
    const ravi = await addStaff(server, required, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, required, ravi);
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBeNull();
    expect((await query(server, "settings.get", jar)).status).toBe(200);

    const owner = await signedInOwner(server, required);
    for (const value of [false, true]) {
      const change = await mutate(server, "settings.setTwoFactorRequirement", { required: value }, owner);
      expect(await refusalOf(change)).toEqual({
        status: 404,
        reason: "NOT_FOUND",
      });
    }
  });
});
