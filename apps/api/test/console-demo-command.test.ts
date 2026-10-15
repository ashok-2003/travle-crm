// The command that builds the shared demo now (`demo`), for a fresh local database that shouldn't wait for the
// nightly reset at 02:00: the same reset, with the console's DEMO_ variables. It prints the organization code and the
// usernames to sign in with, never a password. On a database of its own, so the demo's organization and plan touch no
// other file's.
import { createIsolatedDatabase } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { demoCommand } from "../src/console-commands.js";
import { createTestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createTestServer, signInWithCode } from "./support/test-server.js";

describe("the demo command", () => {
  it("builds the demo once and says how to sign in to it, or says which variables to set", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    const server = createTestServer({}, { dbUrls: database.urls });
    const testConsole = createTestConsole(server);
    try {
      const printed = { stdout: [] as string[], stderr: [] as string[] };
      const output = {
        stdout: (line: string) => printed.stdout.push(line),
        stderr: (line: string) => printed.stderr.push(line),
      };
      expect(await demoCommand(testConsole.services, null, [], output)).toBe(1);
      expect(printed).toEqual({
        stdout: [],
        stderr: ["Set DEMO_ORGANIZATION_CODE and DEMO_PASSWORD first (see .env.example)."],
      });

      printed.stderr = [];
      const demo = { code: "DEMO", password: "demo-only-password" };
      expect(await demoCommand(testConsole.services, demo, ["--"], output)).toBe(0);
      expect(printed).toEqual({
        stdout: [
          "The demo is ready: sign in with organization code DEMO, the password in DEMO_PASSWORD and one of",
          "  asha (Owner), ravi (Sales), meena (Operations)",
        ],
        stderr: [],
      });
      for (const username of ["asha", "ravi", "meena"]) {
        const signIn = await signInWithCode(server, new CookieJar(), {
          orgCode: "DEMO",
          username,
          password: demo.password,
        });
        expect(signIn.status).toBe(200);
      }
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });
});
