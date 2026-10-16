// Two-factor off (@travel-crm/contracts/features, the owner's 2026-10-16 ruling), against Postgres: Better Auth has no
// two-factor endpoints and asks nobody for a code, even a person whose row says it is on; support impersonates with a
// password alone; no member's step is two-factor, whatever their organization's row requires; and the requirement
// can't change.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { pendingStep } from "../../src/identity/member-access.js";
import {
  addStaffMember,
  createPlatformAdmin,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

// Off, as the product ships it, whatever the constant says today: these tests prove what the switch turns off.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: false } }));

describe("two-factor off", () => {
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

  function post(path: string, headers: Headers, body: unknown): Promise<Response> {
    return test.identity.auth.handler(
      new Request(`http://localhost/api/auth${path}`, {
        method: "POST",
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("registers no two-factor endpoints, over HTTP or from code", async () => {
    const headers = await signInByEmail(test.identity, agency.ownerEmail, agency.ownerPassword);
    expect((await post("/two-factor/enable", headers, { password: agency.ownerPassword })).status).toBe(404);
    expect((await post("/two-factor/verify-totp", headers, { code: "123456" })).status).toBe(404);
    expect("enableTwoFactor" in test.identity.auth.api).toBe(false);
  });

  it("asks nobody for a code at sign-in, even a person whose row says two-factor is on", async () => {
    const owner = await createTestAgency(test.identity, platform);
    // As finishing the setup screen left it while two-factor was on.
    await test.database.client.user.update({ where: { id: owner.ownerUserId }, data: { twoFactorEnabled: true } });
    await test.database.client.twoFactor.create({
      data: { userId: owner.ownerUserId, secret: "stored-secret", backupCodes: "stored-codes" },
    });
    const response = await test.identity.auth.api.signInEmail({
      body: { email: owner.ownerEmail, password: owner.ownerPassword },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("twoFactorRedirect");
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token="))).toBe(true);
    expect(await test.database.client.session.count({ where: { userId: owner.ownerUserId } })).toBe(1);
  });

  it("lets support without two-factor impersonate an active member", async () => {
    const support = await createPlatformAdmin(test, "support-password-1");
    const headers = await signInByEmail(test.identity, support.email, "support-password-1");
    const started = await post("/admin/impersonate-user", headers, { userId: agency.ownerUserId });
    expect(started.status).toBe(200);
    expect(await test.database.client.session.count({ where: { impersonatedBy: support.userId } })).toBe(1);
  });

  it("asks no member to set up two-factor, even where the organization's row requires it", async () => {
    const required = await createTestAgency(test.identity, platform);
    await platform.organization.update({ where: { id: required.organizationId }, data: { requireTwoFactor: true } });
    const owner = await memberAccessOf(test.identity, required.ownerUserId, required.organizationId);
    const ravi = await addStaffMember(test.identity, owner, "ravi", "sales");
    expect(pendingStep(owner)).toBeNull();
    const me = await test.identity.describeSignedInPerson({
      userId: required.ownerUserId,
      organizationId: required.organizationId,
      impersonatedBy: null,
    });
    expect(me?.pendingStep).toBeNull();
    // A temporary password is still the step it was.
    expect(pendingStep(await memberAccessOf(test.identity, ravi.userId, required.organizationId))).toBe(
      "CHANGE_PASSWORD",
    );
    // Support isn't held back by a two-factor step the member no longer has.
    await test.database.client.user.update({ where: { id: ravi.userId }, data: { mustChangePassword: false } });
    const support = await createPlatformAdmin(test, "support-password-1");
    const headers = await signInByEmail(test.identity, support.email, "support-password-1");
    expect((await post("/admin/impersonate-user", headers, { userId: ravi.userId })).status).toBe(200);
  });

  it("refuses changing the requirement, and leaves what is stored as it was", async () => {
    const owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "NOT_FOUND",
    });
    const stored = await platform.organization.findUniqueOrThrow({ where: { id: agency.organizationId } });
    expect(stored.requireTwoFactor).toBe(false);
  });
});
