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

  it("skips someone whose own password is being saved at the same moment", async () => {
    const racing = await person("racing");
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // The person's own change: their row updated, and not yet committed.
    const choosing = test.database.forOrg(agency.organizationId, async (tx) => {
      await tx.user.update({ where: { id: racing.userId }, data: { mustChangePassword: false } });
      locked();
      await held;
    });
    await lockTaken;
    const reset = test.identity.staff.resetTemporaryPassword(owner, {
      memberId: racing.memberId,
      temporaryPassword: "second-pass-123",
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await choosing;
    expect(await reset).toEqual({ reset: false });
    expect(await canSignInByUsername(test.identity, agency.code, "racing", "first-pass-123")).toBe(true);
  });
});
