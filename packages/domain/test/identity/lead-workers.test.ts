// The people who can work leads (R14): active members whose role is the Owner's or sees leads, for the owner and
// assignee pickers; and the agency's first Owner (R15), who receives a departing member's leads.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("lead workers", () => {
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

  it("lists active members whose role sees leads, by name, without removed or banned ones", async () => {
    const zara = await addStaffMember(test.identity, owner, "Zara", "sales");
    const bina = await addStaffMember(test.identity, owner, "Bina", "org-admin");
    await addStaffMember(test.identity, owner, "Om", "operations");
    const ravi = await addStaffMember(test.identity, owner, "Ravi", "sales");
    await test.identity.staff.remove(owner, { memberId: ravi.memberId });
    const kiran = await addStaffMember(test.identity, owner, "Kiran", "sales");
    await test.database.client.user.update({ where: { id: kiran.userId }, data: { banned: true } });

    expect(await test.identity.leadWorkers(agency.organizationId)).toEqual([
      { userId: agency.ownerUserId, name: "Asha Owner" },
      { userId: bina.userId, name: "Bina" },
      { userId: zara.userId, name: "Zara" },
    ]);
    const other = await createTestAgency(test.identity, platform);
    expect(await test.identity.leadWorkers(other.organizationId)).toEqual([
      { userId: other.ownerUserId, name: "Asha Owner" },
    ]);
  });

  it("names the earliest-joined active Owner", async () => {
    const agency = await createTestAgency(test.identity, platform);
    const first = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
    expect(await test.identity.firstOwner(agency.organizationId)).toBe(agency.ownerUserId);
    const second = await addStaffMember(test.identity, first, "second-owner", "org-owner");
    await addStaffMember(test.identity, first, "an-admin", "org-admin");
    expect(await test.identity.firstOwner(agency.organizationId)).toBe(agency.ownerUserId);
    const secondAccess = await memberAccessOf(test.identity, second.userId, agency.organizationId);
    await test.identity.staff.remove(secondAccess, { memberId: agency.ownerMemberId });
    expect(await test.identity.firstOwner(agency.organizationId)).toBe(second.userId);
  });
});
