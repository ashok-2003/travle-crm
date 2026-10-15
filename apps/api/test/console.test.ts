// The platform console's HTTP app (spec 7): platform staff of either level reach it on a session read from the
// database; organization staff, people with a temporary password and other sites don't. A call that fails unexpectedly
// is logged by names and codes, as the api logs (plan 3).
import { recordPlatformAudit } from "@travel-crm/domain/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConsoleApp } from "../src/console-app.js";
import {
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the platform console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let agency: TestAgency;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    agency = await createTestAgency(server);
    support = await signedInPlatformStaff(server, "support");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("answers its health check", async () => {
    const response = await testConsole.app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("tells platform staff who they are, at their level", async () => {
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", support.jar))).toEqual({
      userId: support.userId,
      name: "Platform support",
      level: "support",
    });
    const superAdmin = await signedInPlatformStaff(server, "super-admin");
    expect(await dataOf(await consoleQuery(testConsole, "whoAmI", superAdmin.jar))).toMatchObject({
      level: "super-admin",
    });
  });

  it("refuses organization staff, people not signed in, and platform staff with a temporary password", async () => {
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
      reason: "PLATFORM_ONLY",
    });
    expect((await consoleQuery(testConsole, "whoAmI")).status).toBe(401);
    const newcomer = await signedInPlatformStaff(server, "support", { mustChangePassword: true });
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", newcomer.jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
  });

  it("reads the session from the database, so a session that is gone stops at once", async () => {
    const leaving = await signedInPlatformStaff(server, "support");
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(200);
    // The cookie cache still holds the session; only the row is gone.
    await server.platform.session.deleteMany({ where: { userId: leaving.userId } });
    expect((await consoleQuery(testConsole, "whoAmI", leaving.jar)).status).toBe(401);
  });

  it("refuses writes from other sites and bodies that aren't JSON, as the api does", async () => {
    const write = (headers: Record<string, string>) =>
      testConsole.app.request("/api/platform/trpc/whoAmI", {
        method: "POST",
        headers: { cookie: support.jar.header, ...headers },
        body: "{}",
      });
    expect((await write({ origin: "https://evil.example", "content-type": "application/json" })).status).toBe(403);
    expect((await write({ origin: "http://localhost", "content-type": "text/plain" })).status).toBe(415);
  });

  it("logs a call that fails unexpectedly by its path and names only, and tells the caller nothing more", async () => {
    const lines: string[] = [];
    const leak = new Error("no row for jane.doe@example.com");
    const { platformDb } = testConsole.services;
    const failing = createConsoleApp(
      { ...testConsole.services, platformDb: { ...platformDb, transaction: () => Promise.reject(leak) } },
      (line) => lines.push(line),
    );
    const response = await failing.request(
      `/api/platform/trpc/log.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      { headers: { cookie: support.jar.header } },
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/jane/);
    expect(lines).toEqual(["console tRPC log.list failed: TRPCError INTERNAL_SERVER_ERROR, caused by Error"]);
  });

  it("shows platform staff the platform log", async () => {
    await testConsole.services.platformDb.transaction((tx) =>
      recordPlatformAudit(
        tx,
        { userId: support.userId },
        {
          action: "organization.viewed",
          targetType: "organization",
          targetId: agency.organizationId,
          targetOrganizationId: agency.organizationId,
        },
      ),
    );
    const page = await dataOf<{ entries: { action: string; actorUserId: string | null }[] }>(
      await consoleQuery(testConsole, "log.list", support.jar, { targetOrganizationId: agency.organizationId }),
    );
    expect(page.entries).toEqual([
      expect.objectContaining({ action: "organization.viewed", actorUserId: support.userId }),
    ]);
  });
});
