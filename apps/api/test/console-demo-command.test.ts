// The command that builds the shared demo now (`demo`), for a fresh local database that shouldn't wait for the
// nightly reset at 02:00: the same reset, with the console's DEMO_ variables. It prints the organization code and the
// usernames to sign in with, never a password; its Owner's setup checklist has only the logo left. On a database of
// its own, so the demo's organization and plan touch no other file's.
import type { SetupChecklist } from "@travel-crm/contracts/profile";
import { createIsolatedDatabase } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { demoCommand } from "../src/console-commands.js";
import { createTestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createTestServer, signInWithCode } from "./support/test-server.js";
import { dataOf, query } from "./support/trpc.js";

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
      const jars = new Map<string, CookieJar>();
      for (const username of ["asha", "ravi", "meena"]) {
        const jar = new CookieJar();
        const signIn = await signInWithCode(server, jar, { orgCode: "DEMO", username, password: demo.password });
        expect(signIn.status).toBe(200);
        jars.set(username, jar);
      }
      // What the demo's Owner sees first on Home: everything is set up but a logo (spec 7.1).
      const checklist = await dataOf<SetupChecklist>(await query(server, "organization.setup.get", jars.get("asha")));
      expect(checklist.steps.filter((step) => !step.done).map((step) => step.step)).toEqual(["logo"]);
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });
});
