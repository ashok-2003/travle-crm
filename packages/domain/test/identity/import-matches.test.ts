// A file's Owner and Role values matched to the agency's people and roles (spec B11): an owner by full name, username
// or email, or by a first name only one lead worker has; never someone who can't work leads; a role by its name or
// its key. Case and extra spaces don't count, and names never leave identity.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import {
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("matching a file's owners and roles", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  const addStaff = (name: string, roleKey: string, sign: { username?: string; email?: string }) =>
    test.identity.staff.create(owner, { name, roleKey, temporaryPassword: "temporary-pass-1", ...sign });

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

  it("matches an owner value by full name, username or email, ignoring case and spaces", async () => {
    const meera = await addStaff("Meera Sharma", "sales", { username: "meera.s", email: "meera@sharma.in" });
    const matches = await test.identity.matchLeadWorkers(agency.organizationId, [
      "meera  SHARMA",
      " MEERA.S ",
      "MEERA@SHARMA.IN",
      "Meera",
      "Asha Owner",
      "Nobody here",
    ]);
    expect(Object.fromEntries(matches)).toEqual({
      "meera  SHARMA": { userId: meera.userId, matchedBy: "name" },
      " MEERA.S ": { userId: meera.userId, matchedBy: "username" },
      "MEERA@SHARMA.IN": { userId: meera.userId, matchedBy: "email" },
      Meera: { userId: meera.userId, matchedBy: "first_name" },
      "Asha Owner": { userId: agency.ownerUserId, matchedBy: "name" },
    });
  });

  it("matches a first name alone only when one lead worker has it", async () => {
    const kumar = await addStaff("Ravi Kumar", "sales", { username: "ravi.k" });
    await addStaff("Ravi Shah", "org-admin", { username: "ravi.s" });
    const matches = await test.identity.matchLeadWorkers(agency.organizationId, ["Ravi", "ravi kumar"]);
    expect(Object.fromEntries(matches)).toEqual({ "ravi kumar": { userId: kumar.userId, matchedBy: "name" } });
  });

  it("never matches someone removed, banned or who can't work leads", async () => {
    const removed = await addStaff("Kiran Rao", "sales", { username: "kiran" });
    await test.identity.staff.remove(owner, { memberId: removed.memberId });
    const banned = await addStaff("Dev Patel", "sales", { username: "dev" });
    await test.database.client.user.update({ where: { id: banned.userId }, data: { banned: true } });
    await addStaff("Om Prakash", "operations", { username: "om", email: "om@sharma.in" });
    const matches = await test.identity.matchLeadWorkers(agency.organizationId, [
      "Kiran Rao",
      "kiran",
      "Dev Patel",
      "Om Prakash",
      "om",
      "om@sharma.in",
    ]);
    expect(matches.size).toBe(0);
    // Another agency's people are never anyone's match here.
    const other = await createTestAgency(test.identity, platform);
    expect((await test.identity.matchLeadWorkers(other.organizationId, ["Meera Sharma"])).size).toBe(0);
  });

  it("matches a role by its name or its key, the Owner's included", async () => {
    const matches = await test.identity.matchRoles(agency.organizationId, [
      "Sales",
      " SALES ",
      "org-admin",
      "owner",
      "Manager",
    ]);
    expect(Object.fromEntries(matches)).toEqual({
      Sales: { roleKey: "sales", matchedBy: "name" },
      " SALES ": { roleKey: "sales", matchedBy: "name" },
      "org-admin": { roleKey: "org-admin", matchedBy: "word" },
      owner: { roleKey: "org-owner", matchedBy: "name" },
    });
  });
});
