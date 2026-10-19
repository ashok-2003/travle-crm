// A staff member's phone (B51): optional, E.164, not unique, changed from the row's menu, and never in the audit log;
// erasing a removed member empties it, and their export carries it first.
import { withDeleted } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { erasePerson, personExport, type MemberAccess } from "../../src/identity/index.js";
import {
  addStaffMember,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("staff phones", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
    await platform.$disconnect();
  });

  const auditText = async (memberId: string) =>
    JSON.stringify(await platform.auditEntry.findMany({ where: { entityId: memberId } }));

  it("keeps a staff member's phone in E.164, optional and not unique, and never in the audit log", async () => {
    const first = await test.identity.staff.create(owner, {
      name: "Ravi",
      username: "ravi-phone",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
      phone: "+919876501234",
    });
    const second = await test.identity.staff.create(owner, {
      name: "Meera",
      username: "meera-phone",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
      phone: "+919876501234",
    });
    const without = await addStaffMember(test.identity, owner, "no-phone", "sales");
    expect([first.phone, second.phone, without.phone]).toEqual(["+919876501234", "+919876501234", null]);
    expect((await test.identity.staff.list(owner)).find((member) => member.memberId === first.memberId)?.phone).toBe(
      "+919876501234",
    );
    await expect(
      platform.$executeRaw`UPDATE member SET phone_e164 = '98765' WHERE id = ${first.memberId}::uuid`,
    ).rejects.toThrow(/member_phone_format/);
    expect(await auditText(first.memberId)).not.toContain("9876501234");
  });

  it("changes a phone with staff.changePhone, recording staff.phone-changed without the number", async () => {
    const person = await addStaffMember(test.identity, owner, "change-phone", "sales");
    const changed = await test.identity.staff.changePhone(owner, { memberId: person.memberId, phone: "+919811122233" });
    expect(changed.phone).toBe("+919811122233");
    const cleared = await test.identity.staff.changePhone(owner, { memberId: person.memberId, phone: null });
    expect(cleared.phone).toBeNull();
    const entries = await platform.auditEntry.findMany({
      where: { entityId: person.memberId, action: "staff.phone-changed" },
    });
    expect(entries).toHaveLength(2);
    expect(await auditText(person.memberId)).not.toContain("9811122233");
  });

  it("refuses to change one's own phone, and an unknown member's", async () => {
    await expect(
      test.identity.staff.changePhone(owner, { memberId: agency.ownerMemberId, phone: "+919811122233" }),
    ).rejects.toMatchObject({ reason: "CANNOT_CHANGE_YOURSELF" });
    await expect(
      test.identity.staff.changePhone(owner, {
        memberId: crypto.randomUUID(),
        phone: "+919811122233",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("empties a removed member's phone when they are erased, and lists it in their export before", async () => {
    const person = await test.identity.staff.create(owner, {
      name: "Erase Me",
      username: "erase-phone",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
      phone: "+919822233344",
    });
    await test.identity.staff.remove(owner, { memberId: person.memberId });
    const exported = await platformDb.transaction((tx) => personExport(tx, agency.organizationId, person.memberId));
    expect(exported.phone).toBe("+919822233344");
    await platformDb.transaction((tx) => erasePerson(tx, agency.organizationId, person.memberId));
    const member = await withDeleted(() => platform.member.findUniqueOrThrow({ where: { id: person.memberId } }));
    expect(member.phoneE164).toBeNull();
  });
});
