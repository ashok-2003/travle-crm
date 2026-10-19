// Adding an imported team (B45, B47): every account in one transaction or none; the seats counted for the whole file
// under the organization's lock, against another import and Add staff racing for them; each person with a temporary
// password to change, a phone nobody can read in the audit log, and the import's id on their staff.created entry.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import {
  createIdentity,
  ImportedStaffRowError,
  type Identity,
  type ImportedStaffRow,
  type MemberAccess,
} from "../../src/identity/index.js";
import {
  addStaffMember,
  canSignInByUsername,
  createTestAgency,
  createTestIdentity,
  memberAccessOf,
  testAuthSettings,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("adding an imported team", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;
  let admin: MemberAccess;
  let directors: string;
  const importId = "0199e7a0-0000-7000-8000-0000000000aa";
  const opened: Identity[] = [];

  const limitedTo = (seats: number) => {
    const identity = createIdentity({
      databaseUrl: inject("dbUrls").runtime,
      maxConnections: 4,
      auth: testAuthSettings,
      seatLimit: () => Promise.resolve(seats),
    });
    opened.push(identity);
    return identity;
  };
  let made = 0;
  /** A row of the file with a username no earlier row had. */
  const row = async (rowNumber: number, extra: Partial<ImportedStaffRow> = {}): Promise<ImportedStaffRow> => ({
    rowNumber,
    name: `Person ${String(rowNumber)}`,
    username: `import-${String((made += 1))}-${agency.code.toLowerCase()}`,
    roleKey: "sales",
    passwordHash: (await test.identity.staff.hashTemporaryPasswords([`Temp-pass-${String(rowNumber)}`]))[0] ?? "",
    ...extra,
  });
  const staffCount = async () => (await test.identity.staff.list(owner)).length;
  const noLinks = () => Promise.resolve();

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await memberAccessOf(test.identity, agency.ownerUserId, agency.organizationId);
    const made = await addStaffMember(test.identity, owner, "the-admin", "org-admin");
    admin = await memberAccessOf(test.identity, made.userId, agency.organizationId);
    directors = (
      await test.identity.roles.create(owner, { name: "Directors", permissions: [{ permission: "roles:manage" }] })
    ).key;
  });

  afterAll(async () => {
    await Promise.all(opened.map((identity) => identity.disconnect()));
    await test.close();
    await platform.$disconnect();
  });

  it("hashes each temporary password as Better Auth checks it, one after another", async () => {
    const hashes = await test.identity.staff.hashTemporaryPasswords(["first-pass-123", "second-pass-123"]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes.join()).not.toContain("pass-123");
    const context = await test.identity.auth.$context;
    expect(await context.password.verify({ hash: hashes[1] ?? "", password: "second-pass-123" })).toBe(true);
    expect(await context.password.verify({ hash: hashes[0] ?? "", password: "second-pass-123" })).toBe(false);
  });

  it("adds every row in one transaction, each with a temporary password to change and a phone kept off the log", async () => {
    const first = await row(2, {
      phone: "+919876501234",
      passwordHash: (await test.identity.staff.hashTemporaryPasswords(["Temp-pass-2"]))[0] ?? "",
    });
    const second = await row(3, { username: undefined, email: `import-3-${agency.code.toLowerCase()}@example.test` });
    const afterwards = vi.fn(noLinks);
    const added = await test.identity.staff.addImported(admin, [first, second], importId, afterwards);
    expect(added.map((person) => person.rowNumber)).toEqual([2, 3]);
    expect(afterwards).toHaveBeenCalledOnce();
    expect(afterwards).toHaveBeenCalledWith(expect.anything(), added);
    expect(await canSignInByUsername(test.identity, agency.code, first.username ?? "", "Temp-pass-2")).toBe(true);
    const staff = await test.identity.staff.list(owner);
    const person = staff.find((member) => member.memberId === added[0]?.memberId);
    expect(person).toMatchObject({ phone: "+919876501234", mustChangePassword: true, role: { key: "sales" } });
    const entries = await platform.auditEntry.findMany({
      where: { entityId: added[0]?.memberId ?? "", action: "staff.created" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: admin.userId, after: { role: "sales", importId } });
    expect(JSON.stringify(entries)).not.toMatch(/9876501234|Temp-pass|import-\d/);
  });

  it("adds nobody when a row of the file can't be added now, naming the row", async () => {
    const taken = await addStaffMember(test.identity, owner, `taken-${agency.code.toLowerCase()}`, "sales");
    const before = await staffCount();
    const afterwards = vi.fn(noLinks);
    const rows = [await row(2), await row(3, { username: taken.username ?? undefined }), await row(4)];
    await expect(test.identity.staff.addImported(admin, rows, importId, afterwards)).rejects.toMatchObject({
      name: "ImportedStaffRowError",
      rowNumber: 3,
      reason: "taken_meanwhile",
    });
    expect(await staffCount()).toBe(before);
    expect(afterwards.mock.calls).toHaveLength(0);
  });

  it("never gives the Owner role, even to an Owner, nor a role above the importer's", async () => {
    const before = await staffCount();
    await expect(
      test.identity.staff.addImported(admin, [await row(2, { roleKey: "org-owner" })], importId, noLinks),
    ).rejects.toMatchObject({ rowNumber: 2, reason: "owner_role" });
    await expect(
      test.identity.staff.addImported(owner, [await row(2, { roleKey: "org-owner" })], importId, noLinks),
    ).rejects.toMatchObject({ reason: "owner_role" });
    await expect(
      test.identity.staff.addImported(admin, [await row(2, { roleKey: directors })], importId, noLinks),
    ).rejects.toMatchObject({ rowNumber: 2, reason: "role_above_yours" });
    await expect(
      test.identity.staff.addImported(admin, [await row(2, { roleKey: "no-such-role" })], importId, noLinks),
    ).rejects.toBeInstanceOf(ImportedStaffRowError);
    expect(await staffCount()).toBe(before);
  });

  it("fails when the importer was demoted or removed after their access was resolved", async () => {
    const made = await test.identity.staff.create(owner, {
      name: "Soon demoted",
      username: `soon-${agency.code.toLowerCase()}`,
      roleKey: "org-admin",
      temporaryPassword: "temporary-pass-1",
    });
    const stale = await memberAccessOf(test.identity, made.userId, agency.organizationId);
    await test.identity.staff.updateRole(owner, { memberId: made.memberId, roleKey: "sales" });
    const before = await staffCount();
    await expect(test.identity.staff.addImported(stale, [await row(2)], importId, noLinks)).rejects.toMatchObject({
      reason: "STAFF_CHANGED",
    });
    expect(await staffCount()).toBe(before);
  });

  it("undoes the accounts when what the import does in the same transaction fails", async () => {
    const before = await staffCount();
    await expect(
      test.identity.staff.addImported(admin, [await row(2), await row(3)], importId, () =>
        Promise.reject(new Error("linking failed")),
      ),
    ).rejects.toThrow("linking failed");
    expect(await staffCount()).toBe(before);
  });

  it("refuses the whole file past the seats: IMPORT_OVER_SEAT_LIMIT", async () => {
    const used = await staffCount();
    const identity = limitedTo(used + 1);
    const afterwards = vi.fn(noLinks);
    await expect(
      identity.staff.addImported(admin, [await row(2), await row(3)], importId, afterwards),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "IMPORT_OVER_SEAT_LIMIT" });
    expect(await staffCount()).toBe(used);
    expect(afterwards.mock.calls).toHaveLength(0);
    // One row fits.
    await expect(identity.staff.addImported(admin, [await row(2)], importId, noLinks)).resolves.toHaveLength(1);
  });

  it("lets only one of two imports racing for the last seats add, and an Add staff racing them", async () => {
    const used = await staffCount();
    const identity = limitedTo(used + 2);
    // Every row is made before the three start, so the calls really overlap.
    const first = [await row(2), await row(3)];
    const second = [await row(4), await row(5)];
    const [one, two, single] = await Promise.allSettled([
      identity.staff.addImported(admin, first, importId, noLinks),
      identity.staff.addImported(admin, second, importId, noLinks),
      identity.staff.create(admin, {
        name: "By hand",
        username: `by-hand-${agency.code.toLowerCase()}`,
        roleKey: "sales",
        temporaryPassword: "temporary-pass-9",
      }),
    ]);
    const gained = (await staffCount()) - used;
    expect(gained).toBeLessThanOrEqual(2);
    expect([one.status, two.status].filter((status) => status === "fulfilled").length).toBeLessThanOrEqual(1);
    const expected =
      (one.status === "fulfilled" ? 2 : 0) +
      (two.status === "fulfilled" ? 2 : 0) +
      (single.status === "fulfilled" ? 1 : 0);
    expect(gained).toBe(expected);
    for (const refused of [one, two, single].filter((result) => result.status === "rejected")) {
      expect(["IMPORT_OVER_SEAT_LIMIT", "SEAT_LIMIT_REACHED"]).toContain((refused.reason as { reason: string }).reason);
    }
  });
});
