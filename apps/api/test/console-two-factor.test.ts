// Two-factor sign-in is required of platform staff (spec 6.1: the platform's accounts reach every organization): the
// console refuses staff without it, SET_UP_TWO_FACTOR, until it is on, and a temporary password is replaced first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consoleQuery, createTestConsole, signedInPlatformStaff, type TestConsole } from "./support/console.js";
import { createTestServer, postJson, type TestServer } from "./support/test-server.js";
import { refusalOf } from "./support/trpc.js";
import { enableTwoFactor } from "./support/two-factor.js";

describe("the console's two-factor requirement", () => {
  let server: TestServer;
  let testConsole: TestConsole;

  beforeAll(() => {
    server = createTestServer();
    testConsole = createTestConsole(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("refuses platform staff without two-factor, and lets them in once it is on", async () => {
    const support = await signedInPlatformStaff(server, "support", { twoFactor: false });
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", support.jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
    await enableTwoFactor(server, support.jar, support.password);
    expect((await consoleQuery(testConsole, "whoAmI", support.jar)).status).toBe(200);
  });

  it("refuses a super admin's procedures too", async () => {
    const superAdmin = await signedInPlatformStaff(server, "super-admin", { twoFactor: false });
    expect(await refusalOf(await consoleQuery(testConsole, "platformStaff.list", superAdmin.jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
  });

  it("asks for the temporary password to be replaced first, then for two-factor", async () => {
    const newcomer = await signedInPlatformStaff(server, "support", { mustChangePassword: true, twoFactor: false });
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", newcomer.jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    const change = { currentPassword: newcomer.password, newPassword: "their-own-password-1" };
    expect(newcomer.jar.absorb(await postJson(server, "/api/auth/change-password", change, newcomer.jar)).status).toBe(
      200,
    );
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", newcomer.jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
  });
});
