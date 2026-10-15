// Seats (spec 7.2): an organization adds staff only while its plan has a seat for them, removed members free theirs,
// and two people added at once can't both take the last one.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIdentity, type Identity, type MemberAccess } from "../../src/identity/index.js";
import { createTestAgency, memberAccessOf, testAuthSettings, type TestAgency } from "./test-identity.js";

describe("seats", () => {
  let platform: PlatformClient;
  let identity: Identity;
  let agency: TestAgency;
  let owner: MemberAccess;
  const seatsByOrganization = new Map<string, number>();

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    identity = createIdentity({
      databaseUrl: urls.runtime,
      maxConnections: 4,
      auth: testAuthSettings,
      seatLimit: (organizationId) => Promise.resolve(seatsByOrganization.get(organizationId) ?? null),
    });
    agency = await createTestAgency(identity, platform);
    owner = await memberAccessOf(identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await identity.disconnect();
    await platform.$disconnect();
  });

  const add = (username: string) =>
    identity.staff.create(owner, { name: username, username, roleKey: "sales", temporaryPassword: "temporary-pass-1" });

  it("refuses a member past the plan's seats, and lets a removal free one", async () => {
    // The Owner has one seat; two more.
    seatsByOrganization.set(agency.organizationId, 3);
    await add("anil");
    const bina = await add("bina");
    await expect(add("chetan")).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "SEAT_LIMIT_REACHED" });
    await identity.staff.remove(owner, { memberId: bina.memberId });
    await expect(add("chetan")).resolves.toMatchObject({ username: "chetan" });
  });

  it("gives the last seat to one of two people added at once", async () => {
    const other = await createTestAgency(identity, platform);
    const otherOwner = await memberAccessOf(identity, other.ownerUserId, other.organizationId);
    seatsByOrganization.set(other.organizationId, 2);
    const results = await Promise.allSettled(
      ["dev", "esha"].map((username) =>
        identity.staff.create(otherOwner, {
          name: username,
          username,
          roleKey: "sales",
          temporaryPassword: "temporary-pass-1",
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await platform.member.count({ where: { organizationId: other.organizationId, deletedAt: null } })).toBe(2);
  });

  it("has no limit when the plan gives none", async () => {
    seatsByOrganization.delete(agency.organizationId);
    await expect(add("farah")).resolves.toMatchObject({ username: "farah" });
  });
});
