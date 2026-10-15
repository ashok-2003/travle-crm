// Support impersonates only an organization's active staff (ADR 0019), never other platform staff: a platform admin has
// no membership, so the side door refuses them as a target before Better Auth's own admin rules are reached.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformStaffRoles } from "../../src/identity/index.js";
import { createPlatformAdmin, createTestIdentity, signInByEmail, type TestIdentity } from "./test-identity.js";

describe("impersonation targets", () => {
  let test: TestIdentity;

  beforeAll(() => {
    test = createTestIdentity();
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses support impersonating platform staff, support or super admin", async () => {
    const support = await createPlatformAdmin(test, "support-password-1");
    const headers = await signInByEmail(test.identity, support.email, "support-password-1");
    const otherSupport = await createPlatformAdmin(test, "other-password-1");
    const superAdmin = await createPlatformAdmin(test, "super-password-1");
    await test.database.client.user.update({
      where: { id: superAdmin.userId },
      data: { role: platformStaffRoles["super-admin"] },
    });
    for (const target of [otherSupport.userId, superAdmin.userId, support.userId]) {
      const response = await test.identity.auth.handler(
        new Request("http://localhost/api/auth/admin/impersonate-user", {
          method: "POST",
          headers: {
            cookie: headers.get("cookie") ?? "",
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({ userId: target }),
        }),
      );
      expect(response.status).toBe(403);
      // Our refusal, not Better Auth's YOU_CANNOT_IMPERSONATE_ADMINS: it doesn't depend on the admin plugin's roles.
      expect(await response.json()).toMatchObject({ code: "IMPERSONATION_TARGET_NOT_A_MEMBER" });
    }
    expect(await test.database.client.session.count({ where: { impersonatedBy: support.userId } })).toBe(0);
  });
});
