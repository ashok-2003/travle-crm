// Identity's part of permanent deletion (spec 5), as the platform's jobs run it: one removed person erased on a DPDP
// request, with an export of their data first; and every person of an organization being purged.
import { withDeleted } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  deleteUsers,
  erasePerson,
  organizationUserIds,
  personExport,
  type MemberAccess,
} from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("erasure and purge, identity's part", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let agency: TestAgency;
  let owner: MemberAccess;

  beforeAll(async () => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await test.close();
  });

  /** A member with an email who has signed in, then been removed. */
  async function removedPerson(name: string) {
    const email = `${name}-${crypto.randomUUID()}@example.test`;
    const staff = await test.identity.staff.create(owner, {
      name,
      email,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await signInByEmail(test.identity, email, "temporary-pass-1");
    await platform.verification.create({
      data: {
        identifier: `reset-password:${crypto.randomUUID()}`,
        value: staff.userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await test.identity.staff.remove(owner, { memberId: staff.memberId });
    return { ...staff, email };
  }

  it("exports a removed person's data, then erases their name, addresses and every way to sign in", async () => {
    const person = await removedPerson("meera");
    expect(await platformDb.transaction((tx) => personExport(tx, agency.organizationId, person.memberId))).toEqual({
      memberId: person.memberId,
      userId: person.userId,
      name: "meera",
      email: person.email,
      username: null,
      phone: null,
      role: "sales",
      joinedAt: expect.any(String) as string,
      removedAt: expect.any(String) as string,
    });
    expect(await platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, person.memberId))).toEqual({
      userId: person.userId,
    });
    const user = await platform.user.findUniqueOrThrow({
      where: { id: person.userId },
      include: { accounts: true, sessions: true, twoFactors: true },
    });
    expect(user).toMatchObject({ name: "Erased person", formerEmail: null, username: null, displayUsername: null });
    expect(user.email).toMatch(/^erased-.*@no-email\.invalid$/);
    expect([user.accounts, user.sessions, user.twoFactors]).toEqual([[], [], []]);
    expect(await platform.verification.count({ where: { value: person.userId } })).toBe(0);
    // The membership stays, so audit entries and records still have someone to point at.
    expect(await withDeleted(() => platform.member.count({ where: { id: person.memberId } }))).toBe(1);
    // Erasing again clears nothing more: the row is the same, but for the time Prisma stamps on every update.
    await platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, person.memberId));
    const again = await platform.user.findUniqueOrThrow({
      where: { id: person.userId },
      include: { accounts: true, sessions: true, twoFactors: true },
    });
    expect({ ...again, updatedAt: user.updatedAt }).toEqual(user);
    expect(await platform.verification.count({ where: { value: person.userId } })).toBe(0);
  });

  it("erases only someone already removed, and only in their own organization", async () => {
    const present = await addStaffMember(test.identity, owner, "still-here", "sales");
    await expect(
      platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, present.memberId)),
    ).rejects.toMatchObject({ reason: "REMOVE_FIRST" });
    const other = await createTestAgency(test.identity, platform);
    await expect(
      platformDb.transaction((tx) => erasePerson(tx, other.organizationId, present.memberId)),
    ).rejects.toMatchObject({ reason: "MEMBER_NOT_FOUND" });
  });

  it("finds every person who was ever a member of an organization, and deletes them with their sessions", async () => {
    const purged = await createTestAgency(test.identity, platform);
    const purgedOwner = await memberAccessOf(test.identity, purged.ownerUserId, purged.organizationId);
    const leaver = await addStaffMember(test.identity, purgedOwner, "leaver", "sales");
    await test.identity.staff.remove(purgedOwner, { memberId: leaver.memberId });
    await signInByEmail(test.identity, purged.ownerEmail, purged.ownerPassword);
    const userIds = await platformDb.transaction((tx) => organizationUserIds(tx, purged.organizationId));
    expect(userIds.sort()).toEqual([purged.ownerUserId, leaver.userId].sort());
    expect(await platformDb.transaction((tx) => deleteUsers(tx, userIds))).toBe(2);
    expect(await platform.user.count({ where: { id: { in: userIds } } })).toBe(0);
    expect(await platform.session.count({ where: { userId: { in: userIds } } })).toBe(0);
    expect(await withDeleted(() => platform.member.count({ where: { organizationId: purged.organizationId } }))).toBe(
      0,
    );
    // Another organization's people are untouched.
    expect(await platform.user.count({ where: { id: agency.ownerUserId } })).toBe(1);
  });
});
