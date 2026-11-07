// The command that plays test chats through the grounded agent (`agent-cases`): it refuses a database that is not on this
// computer, runs a folder's cases with their scripted answers (`--fake`), prints one line per case and expectation with no
// chat words, exits non-zero when one fails, and leaves no organization behind. On a database of its own.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIsolatedDatabase } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { removeCaseOrganization } from "@travel-crm/domain/platform";
import { agentCasesCommand, isLocalDatabaseUrl } from "../src/console-agent-cases.js";
import { createTestConsole } from "./support/console.js";
import { createTestServer } from "./support/test-server.js";

const spoken = "Do you run Meghalaya trips for my family of six";
const aCase = (name: string, includes: string) => ({
  name,
  chat: [{ from: "customer", text: spoken }],
  scripted: {
    read: {
      places: [{ destination: "none", words: "Meghalaya", evidence: "run Meghalaya trips" }],
      wants: "information",
      wantsEvidence: "Do you run",
    },
    write: [{ reply: "We don't run Meghalaya at the moment, sorry." }],
  },
  expect: { sent: true, includes: [includes], flagged: true },
});

describe("the agent-cases command", () => {
  it("accepts only a database address that is surely this computer", () => {
    for (const url of [
      "postgresql://u@127.0.0.1:5432/db",
      "postgresql://u@localhost/db",
      "postgresql://u@[::1]:5432/db",
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(true);
    }
    for (const url of [
      "postgresql://u@localhost/db?host=evil.example",
      "postgresql://u@localhost/db?hostaddr=1.2.3.4",
      "postgresql://u@localhost/db?service=x",
      "postgresql://u@localhost.evil.com/db",
      "postgresql:///db?host=/var/run/postgresql",
      "postgresql://u@db.example.com/db",
      "",
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(false);
    }
  });

  it("refuses a hosted database, plays a folder's cases, fails on a broken expectation and removes its organization", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    const server = createTestServer({}, { dbUrls: database.urls });
    const testConsole = createTestConsole(server);
    try {
      const printed = { stdout: [] as string[], stderr: [] as string[] };
      const output = {
        stdout: (line: string) => printed.stdout.push(line),
        stderr: (line: string) => printed.stderr.push(line),
      };
      const local = {
        ai: null,
        databaseUrls: ["postgresql://u:p@localhost:5432/db", "postgresql://u:p@[::1]:5432/db"],
      };

      // A database anywhere else is refused before anything is made.
      const hosted = { ai: null, databaseUrls: ["postgresql://u:p@db.example.com:5432/db"] };
      expect(await agentCasesCommand(testConsole.services, hosted, ["--fake"], output)).toBe(1);
      expect(printed.stderr.at(-1)).toContain("not on this computer");
      // The real model needs its key.
      expect(await agentCasesCommand(testConsole.services, local, [], output)).toBe(1);
      expect(printed.stderr.at(-1)).toContain("AI_*");

      const folder = mkdtempSync(join(tmpdir(), "agent-cases-"));
      writeFileSync(join(folder, "one.json"), JSON.stringify([aCase("holds", "Meghalaya"), aCase("breaks", "Spiti")]));
      printed.stdout = [];
      expect(await agentCasesCommand(testConsole.services, local, ["--", "--dir", folder, "--fake"], output)).toBe(1);
      expect(printed.stdout).toContain("pass  holds  sent");
      expect(printed.stdout).toContain("pass  holds  includes 1");
      expect(printed.stdout).toContain("FAIL  breaks  includes 1");
      expect(printed.stdout.at(-1)).toBe("1 expectation(s) failed.");
      // Only the case's name and the expectation's: never what was said.
      expect(printed.stdout.join("\n")).not.toContain("family of six");
      expect(printed.stdout.join("\n")).not.toContain("Meghalaya");

      // Another organization's id is refused, and the organization is still there.
      const other = await testConsole.services.platformDb.transaction((tx) =>
        tx.organization.create({
          data: { name: "Real Holidays", code: "REAL01", timeZone: "Asia/Kolkata" },
          select: { id: true },
        }),
      );
      await expect(removeCaseOrganization(testConsole.services, other.id)).rejects.toThrow("Only the agent test chats");
      expect(await testConsole.services.platformDb.transaction((tx) => tx.organization.count())).toBe(1);
      await testConsole.services.platformDb.transaction((tx) => tx.organization.delete({ where: { id: other.id } }));

      const left = await testConsole.services.platformDb.transaction((tx) => tx.organization.count());
      expect(left).toBe(0);
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });
});
