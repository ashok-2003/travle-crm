// An organization's members in the console (organizations.members): each active member with their role, whether they
// are an Owner, their real email or none, whether they have a password yet (an invited Owner hasn't) and when they
// last used the app; removed and banned people are left out. Platform staff only.
import type { OrganizationMember } from "@travel-crm/contracts/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { addStaff, ownerAccess, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("an organization's members in the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  const membersOf = async (organizationId: string) =>
    dataOf<OrganizationMember[]>(
      await consoleQuery(testConsole, "organizations.members", support.jar, { organizationId }),
    );

  it("lists each active member, oldest first, with their role, email, password and last activity", async () => {
    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    await query(server, "settings.get", await signedInStaff(server, agency, ravi));
    const meera = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Meera Iyer",
      email: `meera-${agency.code.toLowerCase()}@example.test`,
      roleKey: "operations",
      temporaryPassword: "meera-password-1",
    });
    const members = await membersOf(agency.organizationId);
    expect(members).toEqual([
      {
        memberId: agency.owner.memberId,
        userId: agency.owner.userId,
        name: "Asha Owner",
        roleName: "Owner",
        isOwner: true,
        email: agency.owner.email,
        hasPassword: true,
        lastActiveAt: null,
      },
      expect.objectContaining({
        memberId: ravi.memberId,
        name: "ravi",
        roleName: "Sales",
        isOwner: false,
        email: null,
      }),
      expect.objectContaining({ memberId: meera.memberId, roleName: "Operations", email: meera.email }),
    ]);
    // Ravi used the app just now; nobody else has yet.
    expect(Date.parse(members[1]?.lastActiveAt ?? "")).toBeGreaterThan(Date.now() - 60_000);
    expect(members[2]?.lastActiveAt).toBeNull();
  });

  it("says an invited person has no password yet, and leaves removed and banned people out", async () => {
    const other = await createTestAgency(server);
    await server.platform.account.updateMany({ where: { userId: other.owner.userId }, data: { password: null } });
    const leaver = await addStaff(server, other, { username: "leaver", roleKey: "sales" });
    await server.platform.member.update({
      where: { id: leaver.memberId },
      data: { deletedAt: new Date(), deletedBy: other.owner.userId },
    });
    const banned = await addStaff(server, other, { username: "banned", roleKey: "sales" });
    await server.platform.user.update({ where: { id: banned.userId }, data: { banned: true } });
    expect(await membersOf(other.organizationId)).toEqual([
      expect.objectContaining({ memberId: other.owner.memberId, isOwner: true, hasPassword: false }),
    ]);
  });

  it("refuses an organization that doesn't exist, and anyone but platform staff", async () => {
    const missing = await consoleQuery(testConsole, "organizations.members", support.jar, {
      organizationId: crypto.randomUUID(),
    });
    expect(await refusalOf(missing)).toEqual({ status: 404, reason: "ORGANIZATION_NOT_FOUND" });
    const owner = await signedInOwner(server, agency);
    const refused = await consoleQuery(testConsole, "organizations.members", owner, {
      organizationId: agency.organizationId,
    });
    expect(await refusalOf(refused)).toEqual({ status: 403, reason: "PLATFORM_ONLY" });
  });
});
