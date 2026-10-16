// Support's impersonation needs two-factor sign-in, as the console does (ADR 0019): Better Auth's
// /admin/impersonate-user, the side door the console starts it through, refuses platform staff without it, after a
// temporary password still to replace, so nobody reaches an agency's data past the console's own check.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlatformAdmin,
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("impersonation and two-factor", () => {
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

  it("refuses support without two-factor, and starts nothing, until two-factor is on", async () => {
    const support = await createPlatformAdmin(test, "support-password-1");
    const headers = await signInByEmail(test.identity, support.email, "support-password-1");
    const refused = await impersonate(headers, agency.ownerUserId);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "SET_UP_TWO_FACTOR" });
    expect(await test.database.client.session.count({ where: { impersonatedBy: support.userId } })).toBe(0);

    // As finishing the setup screen leaves it; the side door reads the column on every call.
    await test.database.client.user.update({ where: { id: support.userId }, data: { twoFactorEnabled: true } });
    expect((await impersonate(headers, agency.ownerUserId)).status).toBe(200);
    expect(await test.database.client.session.count({ where: { impersonatedBy: support.userId } })).toBe(1);
  });

  it("asks for a new password first, as the console does", async () => {
    const support = await createPlatformAdmin(test, "support-password-1");
    const headers = await signInByEmail(test.identity, support.email, "support-password-1");
    await test.database.client.user.update({ where: { id: support.userId }, data: { mustChangePassword: true } });
    const refused = await impersonate(headers, agency.ownerUserId);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CHANGE_PASSWORD" });
  });
});
