// Other modules learn about an organization and its people only through these: the profile, and members' contacts
// with placeholder addresses hidden and people who left or belong elsewhere left out.
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("organization profile and member contacts", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("gives the organization's name, code, time zone and contact email", async () => {
    expect(await test.identity.organizationProfile(agency.organizationId)).toEqual({
      id: agency.organizationId,
      name: "Test agency",
      code: agency.code,
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    await platform.organization.update({
      where: { id: agency.organizationId },
      data: { timeZone: "Asia/Dubai", contactEmail: "hello@agency.example" },
    });
    expect(await test.identity.organizationProfile(agency.organizationId)).toMatchObject({
      timeZone: "Asia/Dubai",
      contactEmail: "hello@agency.example",
    });
    expect(await test.identity.organizationProfile("0199e7a0-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("gives active members' contacts, with no placeholder email and nobody from elsewhere", async () => {
    const withoutEmail = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      password: "ravi-password-1",
      mustChangePassword: false,
    });
    const leaver = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Leaver",
      email: "leaver@agency.example",
      roleKey: "sales",
      password: "leaver-password-1",
      mustChangePassword: false,
    });
    await test.database.client.member.update({ where: { id: leaver.memberId }, data: softDeleted(agency.ownerUserId) });
    const other = await createTestAgency(test.identity, platform);

    const contacts = await test.identity.memberContacts(agency.organizationId, [
      agency.ownerUserId,
      withoutEmail.userId,
      leaver.userId,
      other.ownerUserId,
    ]);
    expect(contacts).toEqual([
      { userId: agency.ownerUserId, name: "Asha Owner", email: agency.ownerEmail },
      { userId: withoutEmail.userId, name: "Ravi", email: null },
    ]);
    expect(await test.identity.memberContacts(agency.organizationId, [])).toEqual([]);
  });
});
