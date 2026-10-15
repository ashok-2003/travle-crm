// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when a member last used
// the app, kept on the member as requests arrive, at most once a day: signing out or being removed doesn't lose it,
// and support's impersonation isn't the organization's activity.
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { memberActivity, recordMemberActivity, type MemberAccess } from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestIdentity,
} from "./test-identity.js";

const HOUR = 60 * 60 * 1000;

describe("member activity", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  /** Every request in these tests arrives on a clock of their own, starting three days ago. */
  const startedAt = new Date(Date.now() - 72 * HOUR);
  const hoursLater = (hours: number) => new Date(startedAt.getTime() + hours * HOUR);

  beforeAll(() => {
    test = createTestIdentity();
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 1 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await test.close();
  });

  const activityOf = async (organizationId: string) =>
    (await platformDb.transaction((tx) => memberActivity(tx, [organizationId])))[0];
  const requestAt = (access: MemberAccess, at: Date) => recordMemberActivity(test.database, access, at);

  async function agencyWithOwner() {
    const agency = await createTestAgency(test.identity, platform);
    return { ...agency, owner: await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId) };
  }

  it("counts active members as seats used, and dates the last request a member made", async () => {
    const busy = await agencyWithOwner();
    const quiet = await agencyWithOwner();
    const gita = await addStaffMember(test.identity, busy.owner, "gita", "sales");
    const leaver = await addStaffMember(test.identity, busy.owner, "hari", "sales");
    await test.identity.staff.remove(busy.owner, { memberId: leaver.memberId });
    await requestAt(await memberAccessOf(test.identity, gita.userId, busy.organizationId), hoursLater(2));
    // An impersonation is support's activity, not the organization's; signing in alone is no request.
    const impersonated = await memberAccessOf(test.identity, quiet.ownerUserId, quiet.organizationId, {
      impersonatedBy: crypto.randomUUID(),
    });
    await requestAt(impersonated, hoursLater(2));
    await signInByEmail(test.identity, quiet.ownerEmail, quiet.ownerPassword);
    const activity = await platformDb.transaction((tx) =>
      memberActivity(tx, [busy.organizationId, quiet.organizationId]),
    );
    expect(activity).toEqual([
      { organizationId: busy.organizationId, seatsUsed: 2, lastActiveAt: hoursLater(2).toISOString() },
      { organizationId: quiet.organizationId, seatsUsed: 1, lastActiveAt: null },
    ]);
  });

  it("writes a member's activity at most once a day", async () => {
    const { organizationId, owner } = await agencyWithOwner();
    await requestAt(owner, hoursLater(0));
    await requestAt(owner, hoursLater(23));
    expect(await activityOf(organizationId)).toMatchObject({ lastActiveAt: hoursLater(0).toISOString() });
    await requestAt(owner, hoursLater(25));
    expect(await activityOf(organizationId)).toMatchObject({ lastActiveAt: hoursLater(25).toISOString() });
  });

  it("keeps the last activity when the member signs out, or is removed", async () => {
    const { organizationId, owner, ownerEmail, ownerPassword } = await agencyWithOwner();
    const headers = await signInByEmail(test.identity, ownerEmail, ownerPassword);
    await requestAt(owner, hoursLater(1));
    // Signing out deletes the session, as a reset or a removal deletes them all.
    await test.identity.auth.api.signOut({ headers });
    expect(await test.database.client.session.count({ where: { userId: owner.userId } })).toBe(0);
    expect(await activityOf(organizationId)).toMatchObject({ lastActiveAt: hoursLater(1).toISOString() });
    const leaver = await addStaffMember(test.identity, owner, "leaver", "sales");
    await requestAt(await memberAccessOf(test.identity, leaver.userId, organizationId), hoursLater(30));
    await test.identity.staff.remove(owner, { memberId: leaver.memberId });
    expect(await activityOf(organizationId)).toMatchObject({
      seatsUsed: 1,
      lastActiveAt: hoursLater(30).toISOString(),
    });
  });
});
