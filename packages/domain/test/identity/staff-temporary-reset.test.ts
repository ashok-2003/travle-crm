// A lost sheet's new passwords (B50) reset only people who still have the temporary one: a person who chose their own
// is skipped, however close the two are, because the reset checks under the member's and the user's locks.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  canSignInByUsername,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("resetting a temporary password only while it is temporary", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
  });
  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  const person = (username: string) =>
    test.identity.staff.create(owner, {
      name: username,
      username,
      roleKey: "sales",
      temporaryPassword: "first-pass-123",
    });

  it("resets someone who hasn't chosen a password, and skips someone who has", async () => {
    const waiting = await person("waiting");
    const chosen = await person("chosen");
    await platform.user.update({ where: { id: chosen.userId }, data: { mustChangePassword: false } });
    expect(
      await test.identity.staff.resetTemporaryPassword(owner, {
        memberId: waiting.memberId,
        temporaryPassword: "second-pass-123",
      }),
    ).toEqual({ reset: true });
    expect(
      await test.identity.staff.resetTemporaryPassword(owner, {
        memberId: chosen.memberId,
        temporaryPassword: "second-pass-123",
      }),
    ).toEqual({ reset: false });
    expect(await canSignInByUsername(test.identity, agency.code, "waiting", "second-pass-123")).toBe(true);
    expect(await canSignInByUsername(test.identity, agency.code, "chosen", "first-pass-123")).toBe(true);
    expect(await canSignInByUsername(test.identity, agency.code, "chosen", "second-pass-123")).toBe(false);
  });

  it("skips someone whose own password is committed but whose flag isn't yet cleared, in Better Auth's real order", async () => {
    const racing = await person("racing");
    // Better Auth's change-password writes the credential account first, and a database hook clears the flag after.
    const context = await test.identity.auth.$context;
    await platform.account.updateMany({
      where: { userId: racing.userId, providerId: "credential" },
      data: { password: await context.password.hash("their-own-pass-1") },
    });
    const reset = await test.identity.staff.resetTemporaryPassword(owner, {
      memberId: racing.memberId,
      temporaryPassword: "second-pass-123",
    });
    await platform.user.update({ where: { id: racing.userId }, data: { mustChangePassword: false } });
    expect(reset).toEqual({ reset: false });
    expect(await canSignInByUsername(test.identity, agency.code, "racing", "their-own-pass-1")).toBe(true);
    expect(await canSignInByUsername(test.identity, agency.code, "racing", "second-pass-123")).toBe(false);
  });

  it("still resets someone whose temporary password was itself reset, and who hasn't signed in", async () => {
    const again = await person("again");
    await test.identity.staff.resetPassword(owner, { memberId: again.memberId, temporaryPassword: "second-pass-123" });
    expect(
      await test.identity.staff.resetTemporaryPassword(owner, {
        memberId: again.memberId,
        temporaryPassword: "third-pass-123",
      }),
    ).toEqual({ reset: true });
  });

  it("skips someone who changed their password through Better Auth itself", async () => {
    const real = await person("realchange");
    const stamped = () =>
      platform.account.findFirstOrThrow({ where: { userId: real.userId, providerId: "credential" } });
    expect((await stamped()).updatedAt.getTime()).toBe(0);
    const response = await test.identity.auth.api.signInUsername({
      body: { username: `${agency.code}:realchange`.toLowerCase(), password: "first-pass-123" },
      asResponse: true,
    });
    const cookie = response.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; ");
    // The app's first-sign-in change: Better Auth's own endpoint, with the session.
    await test.identity.auth.api.changePassword({
      headers: new Headers({ cookie }),
      body: { currentPassword: "first-pass-123", newPassword: "their-own-pass-2" },
    });
    expect((await stamped()).updatedAt.getTime()).toBeGreaterThan(0);
    expect(
      await test.identity.staff.resetTemporaryPassword(owner, {
        memberId: real.memberId,
        temporaryPassword: "second-pass-123",
      }),
    ).toEqual({ reset: false });
    expect(await canSignInByUsername(test.identity, agency.code, "realchange", "their-own-pass-2")).toBe(true);
  });
});
