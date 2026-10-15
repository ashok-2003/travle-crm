// The last super admin stays (spec 5): nobody can demote or remove them, themselves included, and two super admins
// demoting or removing each other at the same moment leave exactly one. Each test runs on a database of its own: the
// rule counts every super admin, and the other test files add theirs to the shared one.
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import {
  consoleMutate,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { refusalOf } from "./support/trpc.js";

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

  const demote = (actor: TestPlatformStaff, target: TestPlatformStaff) =>
    consoleMutate(testConsole, "platformStaff.setLevel", { userId: target.userId, level: "support" }, actor.jar);
  const remove = (actor: TestPlatformStaff, target: TestPlatformStaff) =>
    consoleMutate(testConsole, "platformStaff.remove", { userId: target.userId }, actor.jar);
  const superAdmins = () => server.platform.user.count({ where: { role: "super-admin", banned: { not: true } } });

  it("can't be demoted or removed, even by themselves, while support stays", async () => {
    const only = await signedInPlatformStaff(server, "super-admin");
    await signedInPlatformStaff(server, "support");
    const refusal = { status: 409, reason: "LAST_SUPER_ADMIN" };
    expect(await refusalOf(await demote(only, only))).toEqual(refusal);
    expect(await refusalOf(await remove(only, only))).toEqual(refusal);
    expect(await superAdmins()).toBe(1);
  });

  it("stays when two super admins demote each other at the same moment: exactly one succeeds", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const outcomes = await Promise.all([demote(asha, ravi), demote(ravi, asha)]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 403]);
    const refused = outcomes.find((response) => !response.ok);
    expect(refused && (await refusalOf(refused))).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await superAdmins()).toBe(1);
  });

  it("stays when two super admins remove each other at the same moment: exactly one succeeds", async () => {
    const asha = await signedInPlatformStaff(server, "super-admin");
    const ravi = await signedInPlatformStaff(server, "super-admin");
    const outcomes = await Promise.all([remove(asha, ravi), remove(ravi, asha)]);
    expect(outcomes.filter((response) => response.ok)).toHaveLength(1);
    expect(await superAdmins()).toBe(1);
  });
});
