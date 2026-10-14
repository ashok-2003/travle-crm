// Removing staff against Postgres (spec 6.3, ADR 0007): the person loses access and sign-in at once, their email and
// username are released, staff.removed is published for the modules that keep things about them, and an organization
// always keeps an Owner.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import {
  canSignInByUsername,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("removing staff", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  const accessOf = (userId: string, organizationId = agency.organizationId) =>
    memberAccessOf(test.identity, userId, organizationId);
  const canSignIn = (code: string, username: string, password: string) =>
    canSignInByUsername(test.identity, code, username, password);

  /** The staff.removed events published about one member. */
  const removalEventsOf = (memberId: string) =>
    test.database.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findMany({
        where: { type: "staff.removed", payload: { path: ["memberId"], equals: memberId } },
        select: { payload: true },
      }),
    );

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await accessOf(agency.ownerUserId);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("treats a member of another organization as not found", async () => {
    const other = await createTestAgency(test.identity, platform);
    await expect(test.identity.staff.remove(owner, { memberId: other.ownerMemberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "MEMBER_NOT_FOUND",
    });
  });

  it("leaves the person exactly as they were when their removal is refused", async () => {
    const email = `self-${agency.code.toLowerCase()}@example.test`;
    const created = await test.identity.staff.create(owner, {
      name: "Sam",
      email,
      username: "sam",
      roleKey: "org-admin",
      temporaryPassword: "sam-temp-pass-1",
    });
    await signInByEmail(test.identity, email, "sam-temp-pass-1");
    const stateOf = async () => ({
      user: await test.database.client.user.findUniqueOrThrow({
        where: { id: created.userId },
        select: { email: true, username: true, formerEmail: true, banned: true, banReason: true },
      }),
      password: (await test.database.client.account.findFirstOrThrow({ where: { userId: created.userId } })).password,
      sessions: await test.database.client.session.count({ where: { userId: created.userId } }),
      member: await test.database.client.member.findUnique({ where: { id: created.memberId } }),
      removalEvents: await removalEventsOf(created.memberId),
    });
    const before = await stateOf();
    expect(before).toMatchObject({ user: { email, username: expect.stringMatching(/:sam$/) as unknown }, sessions: 1 });
    // The only refusal a removal can reach on its own: LAST_OWNER needs an Owner removing themselves, refused first.
    await expect(
      test.identity.staff.remove(await accessOf(created.userId), { memberId: created.memberId }),
    ).rejects.toMatchObject({ reason: "CANNOT_CHANGE_YOURSELF" });
    expect(await stateOf()).toEqual(before);
  });

  it("publishes staff.removed with the member's and user's ids, and nothing else", async () => {
    const leaving = await test.identity.staff.create(owner, {
      name: "Leela",
      username: "leela",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-12",
    });
    await test.identity.staff.remove(owner, { memberId: leaving.memberId });
    // The notifications module listens, and forgets the person's browsers (ADR 0007).
    expect(await removalEventsOf(leaving.memberId)).toEqual([
      { payload: { memberId: leaving.memberId, userId: leaving.userId } },
    ]);
  });

  it("keeps an Owner when two Owners remove each other at the same moment", async () => {
    const own = await createTestAgency(test.identity, platform);
    const first = await accessOf(own.ownerUserId, own.organizationId);
    const created = await test.identity.staff.create(first, {
      name: "Second Owner",
      username: "owner2",
      roleKey: "org-owner",
      temporaryPassword: "temporary-pass-11",
    });
    const second = await accessOf(created.userId, own.organizationId);
    const results = await Promise.allSettled([
      test.identity.staff.remove(first, { memberId: second.memberId }),
      test.identity.staff.remove(second, { memberId: first.memberId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    // The loser finds it is no longer an Owner once the winner commits; a deadlock or timeout would not match.
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ code: "FORBIDDEN", reason: "OWNER_ONLY" }) as unknown,
    });
    const owners = await test.database.client.member.count({
      where: { organizationId: own.organizationId, role: "org-owner", deletedAt: null },
    });
    expect(owners).toBe(1);
  });

  it("removes a person: no access, no sign-in, and their email and username are free again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const email = `kiran-${agency.code.toLowerCase()}@example.test`;
    const kiran = await test.identity.staff.create(owner, {
      name: "Kiran",
      email,
      username: "kiran",
      roleKey: "sales",
      temporaryPassword: "kiran-temp-pass-1",
    });
    await signInByEmail(test.identity, email, "kiran-temp-pass-1");
    await test.identity.staff.remove(owner, { memberId: kiran.memberId });

    expect(await test.identity.resolveAccess(kiran.userId, agency.organizationId)).toBeNull();
    expect(await test.database.client.session.count({ where: { userId: kiran.userId } })).toBe(0);
    await expect(signInByEmail(test.identity, email, "kiran-temp-pass-1")).rejects.toThrow(/Sign-in failed/);
    expect(await canSignIn(agency.code, "kiran", "kiran-temp-pass-1")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));

    expect(await test.database.client.user.findUnique({ where: { id: kiran.userId } })).toMatchObject({
      formerEmail: email,
      banned: true,
      banReason: "Removed from their organization",
    });
    expect(await test.database.client.account.findFirst({ where: { userId: kiran.userId } })).toMatchObject({
      password: null,
    });

    // The retired address can be worked out from the user id. The hook refuses every ".invalid" address, and the wiped
    // password and the ban each refuse it too. (A server-side call throws the refusal instead of returning it.)
    const retired = `removed-${kiran.userId}@no-email.invalid`;
    await expect(signInByEmail(test.identity, retired, "kiran-temp-pass-1")).rejects.toThrow(
      /Invalid email or password/,
    );

    // Simulate a retired address that somehow became reachable, and test each remaining lock on its own.
    const reachable = `retired-${kiran.userId}@example.com`;
    await test.database.client.user.update({ where: { id: kiran.userId }, data: { email: reachable } });
    const attempt = (password: string) =>
      test.identity.auth.api.signInEmail({ body: { email: reachable, password }, asResponse: true });

    // The wipe alone: not banned, no password to check.
    await test.database.client.user.update({ where: { id: kiran.userId }, data: { banned: false } });
    try {
      expect((await attempt("kiran-temp-pass-1")).ok).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Password not found"));
    } finally {
      await test.database.client.user.update({ where: { id: kiran.userId }, data: { banned: true } });
    }

    // The ban alone: a real password is back, and only the ban refuses.
    const context = await test.identity.auth.$context;
    await test.database.client.account.updateMany({
      where: { userId: kiran.userId, providerId: "credential" },
      data: { password: await context.password.hash("kiran-temp-pass-1") },
    });
    try {
      const banned = await attempt("kiran-temp-pass-1");
      expect(banned.status).toBe(403);
      expect(await banned.json()).toMatchObject({ code: "BANNED_USER" });
    } finally {
      await test.database.client.account.updateMany({
        where: { userId: kiran.userId, providerId: "credential" },
        data: { password: null },
      });
      await test.database.client.user.update({ where: { id: kiran.userId }, data: { email: retired } });
    }
    expect((await test.identity.staff.list(owner)).some((member) => member.memberId === kiran.memberId)).toBe(false);

    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    await expect(
      test.identity.staff.create(otherOwner, {
        name: "Kiran",
        email,
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-2",
      }),
    ).resolves.toMatchObject({ email });
    await expect(
      test.identity.staff.create(owner, {
        name: "Kiran Two",
        username: "kiran",
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-3",
      }),
    ).resolves.toMatchObject({ username: "kiran" });
    await expect(test.identity.staff.remove(owner, { memberId: kiran.memberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
