// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when a member last used
// the app, support's impersonation aside.
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { memberActivity } from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  signInByEmail,
  type TestIdentity,
} from "./test-identity.js";

describe("member activity", () => {
  let test: TestIdentity;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;

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

  it("counts active members as seats used, and dates the last sign-in", async () => {
    const busy = await createTestAgency(test.identity, platform);
    const quiet = await createTestAgency(test.identity, platform);
    const owner = await memberAccessOf(test.identity, busy.ownerUserId, busy.organizationId);
    await addStaffMember(test.identity, owner, "gita", "sales");
    const leaver = await addStaffMember(test.identity, owner, "hari", "sales");
    await test.identity.staff.remove(owner, { memberId: leaver.memberId });
    await signInByEmail(test.identity, busy.ownerEmail, busy.ownerPassword);
    // An impersonation is support's activity, not the organization's.
    await platform.session.create({
      data: {
        userId: quiet.ownerUserId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
        impersonatedBy: crypto.randomUUID(),
      },
    });
    const activity = await platformDb.transaction((tx) =>
      memberActivity(tx, [busy.organizationId, quiet.organizationId]),
    );
    expect(activity).toEqual([
      { organizationId: busy.organizationId, seatsUsed: 2, lastActiveAt: expect.any(String) as string },
      { organizationId: quiet.organizationId, seatsUsed: 1, lastActiveAt: null },
    ]);
  });
});
