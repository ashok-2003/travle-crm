// What identity tells the staff import's check about a file's usernames, emails and roles (B44): who is already on the
// staff, whose email sits on another organization's account, and which roles the importer may give. And how many
// seats are free (B45), for the preview.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIdentity } from "../../src/identity/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  testAuthSettings,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("staff row facts", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;
  let admin: MemberAccess;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
    const created = await test.identity.staff.create(owner, {
      name: "Admin",
      username: "an-admin",
      email: `admin-${agency.code.toLowerCase()}@example.test`,
      roleKey: "org-admin",
      temporaryPassword: "temporary-pass-5",
    });
    admin = await memberAccessOf(test.identity, created.userId, agency.organizationId);
    await addStaffMember(test.identity, owner, "Ravi", "sales");
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("names the usernames and emails already active here, without case", async () => {
    const facts = await test.identity.staff.rowFacts(admin, {
      usernames: ["ravi", "RAVI", "nobody"],
      emails: [`admin-${agency.code.toLowerCase()}@example.test`, "nobody@example.test"],
    });
    expect([...facts.activeUsernames]).toEqual(["ravi"]);
    expect([...facts.activeEmails]).toEqual([`admin-${agency.code.toLowerCase()}@example.test`]);
    expect(facts.emailsElsewhere.size).toBe(0);
  });

  it("names an email that sits on another organization's account, or a removed person's released one", async () => {
    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await memberAccessOf(test.identity, other.ownerUserId, other.organizationId);
    const facts = await test.identity.staff.rowFacts(admin, {
      usernames: [],
      emails: [other.ownerEmail.toUpperCase()],
    });
    expect([...facts.emailsElsewhere]).toEqual([other.ownerEmail]);
    expect(facts.activeEmails.size).toBe(0);
    const gone = await test.identity.staff.create(otherOwner, {
      name: "Gone",
      email: `gone-${other.code.toLowerCase()}@example.test`,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-5",
    });
    await test.identity.staff.remove(otherOwner, { memberId: gone.memberId });
    const released = await test.identity.staff.rowFacts(admin, {
      usernames: [],
      emails: [`gone-${other.code.toLowerCase()}@example.test`],
    });
    expect(released.emailsElsewhere.size).toBe(0);
  });

  it("says, for every role, whether it is the Owner's and whether the importer may give it", async () => {
    const above = await test.identity.roles.create(owner, {
      name: "Directors",
      permissions: [{ permission: "roles:manage" }],
    });
    const facts = await test.identity.staff.rowFacts(admin, { usernames: [], emails: [] });
    expect(facts.roles.get("org-owner")).toEqual({ isOwner: true, mayGive: false });
    expect(facts.roles.get("sales")).toEqual({ isOwner: false, mayGive: true });
    expect(facts.roles.get(above.key)).toEqual({ isOwner: false, mayGive: false });
    // An Owner may give any role but this check still names the Owner's.
    const ownersView = await test.identity.staff.rowFacts(owner, { usernames: [], emails: [] });
    expect(ownersView.roles.get("org-owner")).toEqual({ isOwner: true, mayGive: true });
  });

  it("counts the seats free: null without a limit, else the limit less the active members", async () => {
    expect(await test.identity.staff.seatsFree(agency.organizationId)).toBeNull();
    const limited = createIdentity({
      databaseUrl: inject("dbUrls").runtime,
      maxConnections: 2,
      auth: testAuthSettings,
      seatLimit: () => Promise.resolve(5),
    });
    try {
      const members = (await limited.staff.list(owner)).length;
      expect(await limited.staff.seatsFree(agency.organizationId)).toBe(5 - members);
      const tight = createIdentity({
        databaseUrl: inject("dbUrls").runtime,
        maxConnections: 2,
        auth: testAuthSettings,
        seatLimit: () => Promise.resolve(1),
      });
      expect(await tight.staff.seatsFree(agency.organizationId)).toBe(0);
      await tight.disconnect();
    } finally {
      await limited.disconnect();
    }
  });
});
