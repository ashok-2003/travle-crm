// The command that makes the first super admin (`first-super-admin -- --email <e> --name <n>`), run once with the
// console's environment, never over HTTP. It prints the temporary password to the operator's terminal and nothing
// else, and refuses once any super admin exists, also when two runs start at the same moment. Each test runs on a
// database of its own, where no super admin exists yet: other test files add theirs to the shared one.
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { firstSuperAdminCommand } from "../src/console-commands.js";
import { consoleQuery, createTestConsole, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createTestServer, signInByEmail, type TestServer } from "./support/test-server.js";
import { refusalOf } from "./support/trpc.js";

describe("the first super admin", () => {
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

  /** Runs the command as pnpm hands it its arguments, collecting what it prints to stdout and to stderr. */
  async function run(...args: string[]) {
    const printed = { stdout: [] as string[], stderr: [] as string[] };
    const code = await firstSuperAdminCommand(testConsole.services, args, {
      stdout: (line) => printed.stdout.push(line),
      stderr: (line) => printed.stderr.push(line),
    });
    return { code, ...printed };
  }

  const superAdmins = () => server.platform.user.findMany({ where: { role: "super-admin" }, select: { id: true } });

  it("makes them, printing their temporary password and nothing else, to be replaced at first sign-in", async () => {
    const made = await run("--", "--email", " First@Platform.TEST ", "--name", "First Admin");
    expect(made).toEqual({ code: 0, stdout: [expect.any(String) as string], stderr: [] });
    const [temporaryPassword = ""] = made.stdout;
    const jar = new CookieJar();
    expect((await signInByEmail(server, jar, "first@platform.test", temporaryPassword)).status).toBe(200);
    expect(await refusalOf(await consoleQuery(testConsole, "whoAmI", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    const [admin] = await superAdmins();
    const entries = await server.platform.platformAuditEntry.findMany({
      omit: { id: true, occurredAt: true },
    });
    expect(entries).toEqual([
      {
        actorUserId: null,
        action: "platform-staff.added",
        targetType: "platform_staff",
        targetId: admin?.id,
        targetOrganizationId: null,
        before: null,
        after: { level: "super-admin" },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain(temporaryPassword);
  });

  it("refuses once a super admin exists", async () => {
    expect((await run("--email", "first@platform.test", "--name", "First")).code).toBe(0);
    expect(await run("--email", "second@platform.test", "--name", "Second")).toEqual({
      code: 1,
      stdout: [],
      stderr: ["A super admin exists already: they add everyone else from the console."],
    });
    expect(await superAdmins()).toHaveLength(1);
  });

  it("makes one when two runs start at the same moment", async () => {
    const runs = await Promise.all([
      run("--email", "first@platform.test", "--name", "First"),
      run("--email", "second@platform.test", "--name", "Second"),
    ]);
    expect(runs.map((made) => made.code).sort()).toEqual([0, 1]);
    expect(await superAdmins()).toHaveLength(1);
  });

  it("explains its arguments when one is missing or isn't valid, and makes no one", async () => {
    const usage = "Usage: first-super-admin -- --email <address> --name <name>";
    expect(await run("--email", "first@platform.test")).toEqual({ code: 1, stdout: [], stderr: [usage] });
    expect(await run("--email", "not-an-address", "--name", "First")).toEqual({ code: 1, stdout: [], stderr: [usage] });
    expect(await run("--email", "first@platform.test", "--name", "First", "--level", "support")).toEqual({
      code: 1,
      stdout: [],
      stderr: [usage],
    });
    expect(await superAdmins()).toHaveLength(0);
  });
});
