// The last super admin stays (spec 5): nobody can demote or remove them, themselves included, and a super admin who
// hasn't replaced their temporary password yet doesn't count as another. Two super admins demoting or removing each
// other leave exactly one: proven with the two changes forced to overlap (the first held open, uncommitted, while the
// second runs), and through the console's HTTP at the same moment. Each test runs on a database of its own: the rule
// counts every super admin, and the other test files add theirs to the shared one.
import type { AddedPlatformStaff } from "@travel-crm/contracts/platform";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { changePlatformStaffLevel, removeFromPlatformStaff } from "@travel-crm/domain/identity";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import {
  consoleMutate,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { overlapping } from "./support/overlapping.js";
import { createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the last super admin", () => {
  let database: IsolatedDatabase;
  let server: TestServer;
  let testConsole: TestConsole;

  beforeEach(async () => {
    database = await createIsolatedDatabase(inject("dbUrls"));
    server = createTestServer({}, { dbUrls: database.urls });
    testConsole = createTestConsole(server);
  });

  afterEach(async () => {
    await testConsole.close();
    await server.close();
    await database.drop();
  });

  const demote = (actor: TestPlatformStaff, target: { userId: string }) =>
    consoleMutate(testConsole, "platformStaff.setLevel", { userId: target.userId, level: "support" }, actor.jar);
  const remove = (actor: TestPlatformStaff, target: { userId: string }) =>
    consoleMutate(testConsole, "platformStaff.remove", { userId: target.userId }, actor.jar);
  const superAdmins = () => server.platform.user.count({ where: { role: "super-admin", banned: { not: true } } });
  const lastSuperAdmin = { status: 409, reason: "LAST_SUPER_ADMIN" };

  it("can't be demoted or removed, even by themselves, while support stays", async () => {
    const only = await signedInPlatformStaff(server, "super-admin");
    await signedInPlatformStaff(server, "support");
    expect(await refusalOf(await demote(only, only))).toEqual(lastSuperAdmin);
    expect(await refusalOf(await remove(only, only))).toEqual(lastSuperAdmin);
    expect(await superAdmins()).toBe(1);
  });

  it("isn't replaced by a super admin who hasn't chosen a password yet", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const newcomer = { name: "New super admin", email: "newcomer@platform.test", level: "super-admin" };
    const added = await dataOf<AddedPlatformStaff>(
      await consoleMutate(testConsole, "platformStaff.add", newcomer, asha.jar),
    );
    expect(await refusalOf(await demote(asha, asha))).toEqual(lastSuperAdmin);
    expect(await refusalOf(await remove(asha, asha))).toEqual(lastSuperAdmin);

    const jar = new CookieJar();
    await signInByEmail(server, jar, newcomer.email, added.temporaryPassword);
    const change = { currentPassword: added.temporaryPassword, newPassword: "their-own-password" };
    expect(jar.absorb(await postJson(server, "/api/auth/change-password", change, jar)).status).toBe(200);
    expect((await demote(asha, asha)).status).toBe(200);
  });

  it("stays when a demotion runs inside another's open transaction: the second waits, then is refused", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const [first, second] = await overlapping(
      testConsole.services.platformDb,
      server.platform,
      (tx) => changePlatformStaffLevel(tx, asha, { userId: ravi.userId, level: "support" }),
      (tx) => changePlatformStaffLevel(tx, ravi, { userId: asha.userId, level: "support" }),
    );
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: { reason: "SUPER_ADMIN_ONLY" } });
    expect(await superAdmins()).toBe(1);
  });

  it("stays when a removal runs inside another's open transaction: the second waits, then is refused", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const [first, second] = await overlapping(
      testConsole.services.platformDb,
      server.platform,
      (tx) => removeFromPlatformStaff(tx, asha, ravi.userId),
      (tx) => removeFromPlatformStaff(tx, ravi, asha.userId),
    );
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: { reason: "SUPER_ADMIN_ONLY" } });
    expect(await superAdmins()).toBe(1);
  });

  it("stays when two super admins demote each other through the console at once: exactly one succeeds", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const outcomes = await Promise.all([demote(asha, ravi), demote(ravi, asha)]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 403]);
    const refused = outcomes.find((response) => !response.ok);
    expect(refused && (await refusalOf(refused))).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await superAdmins()).toBe(1);
  });

  it("stays when two super admins remove each other through the console at once: exactly one succeeds", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const outcomes = await Promise.all([remove(asha, ravi), remove(ravi, asha)]);
    expect(outcomes.filter((response) => response.ok)).toHaveLength(1);
    const refused = outcomes.find((response) => !response.ok);
    // Its session was gone before the console read it, or it was let in and refused under the lock; never a 409.
    expect([
      { status: 401, reason: null },
      { status: 403, reason: "SUPER_ADMIN_ONLY" },
    ]).toContainEqual(refused && (await refusalOf(refused)));
    expect(await superAdmins()).toBe(1);
  });
});
