// The command that replays test chats through the lite agent (`agent-bench`): it refuses a database that is not on this
// computer and a report inside the repository, plays a folder's cases with their scripted answers (`--fake`), prints one
// line per case and check with no chat words, writes the words to a private report, and leaves no organization behind.
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createIsolatedDatabase } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { runAgentBench, type AgentBenchProcessOptions } from "../src/console-agent-bench-start.js";
import { agentBenchCommand, insideRepository, isLocalDatabaseUrl } from "../src/console-agent-bench.js";
import { createTestConsole } from "./support/console.js";
import { createTestServer } from "./support/test-server.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const spoken = "Namaste friend, anything for the hills";
const replied = "Greetings traveller, lovely to hear from you";
const scripted = [
  { understand: { intents: [{ name: "hello", proof: "Namaste" }] } },
  { write: { text: `${replied}. We run [package 1].` } },
];
const aCase = (name: string, move: string) => ({
  name,
  chat: [{ from: "customer", text: spoken }],
  scripted,
  expect: { sent: true, move },
});

/** A file's permission bits and words, read through one descriptor, so both are of the same file. */
function modeAndText(file: string): { mode: number; text: string } {
  const descriptor = openSync(file, "r");
  try {
    return { mode: fstatSync(descriptor).mode & 0o777, text: readFileSync(descriptor, "utf8") };
  } finally {
    closeSync(descriptor);
  }
}

const printing = () => {
  const printed = { stdout: [] as string[], stderr: [] as string[] };
  return {
    printed,
    output: {
      stdout: (line: string) => printed.stdout.push(line),
      stderr: (line: string) => printed.stderr.push(line),
    },
  };
};

describe("the agent-bench command", () => {
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

  it("knows a path inside the repository, also through a link", () => {
    const outside = mkdtempSync(join(tmpdir(), "agent-bench-out-"));
    expect(insideRepository(join(repositoryRoot, "apps/api/r.md"), repositoryRoot)).toBe(true);
    expect(insideRepository(join(repositoryRoot, "not/yet/there.md"), repositoryRoot)).toBe(true);
    expect(insideRepository(join(outside, "r.md"), repositoryRoot)).toBe(false);
    // A folder whose name merely starts with two dots is inside, not the parent.
    const root = mkdtempSync(join(tmpdir(), "agent-bench-root-"));
    mkdirSync(join(root, "..dots"));
    expect(insideRepository(join(root, "..dots", "r.md"), root)).toBe(true);
    expect(insideRepository(join(dirname(root), "r.md"), root)).toBe(false);
    symlinkSync(repositoryRoot, join(outside, "link"));
    expect(insideRepository(join(outside, "link", "r.md"), repositoryRoot)).toBe(true);
  });

  it("refuses what it must, plays the cases with --fake, keeps chat words out of stdout and in a private report", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    const server = createTestServer({}, { dbUrls: database.urls });
    const testConsole = createTestConsole(server);
    try {
      const { printed, output } = printing();
      const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
      const folder = mkdtempSync(join(tmpdir(), "agent-bench-cases-"));
      const reportFile = join(mkdtempSync(join(tmpdir(), "agent-bench-report-")), "out", "bench.md");
      const context = {
        ai: null,
        databaseUrls: ["postgresql://u:p@localhost:5432/db", "postgresql://u:p@[::1]:5432/db"],
        repositoryRoot,
        home,
        now: new Date("2026-11-13T09:05:00Z"),
      };
      const organizations = () => testConsole.services.platformDb.transaction((tx) => tx.organization.count());
      writeFileSync(
        join(folder, "one.json"),
        JSON.stringify([aCase("holds", "greet"), aCase("breaks", "answer_package")]),
      );

      // A database anywhere else is refused before anything is made.
      const hosted = { ...context, databaseUrls: ["postgresql://u:p@db.example.com:5432/db"] };
      expect(await agentBenchCommand(testConsole.services, hosted, ["--fake"], output)).toBe(1);
      expect(printed.stderr.at(-1)).toContain("not on this computer");

      // A report inside the repository is refused before any case is read: nothing written, no organization made.
      const inside = join(repositoryRoot, "apps/api/r.md");
      const args = ["--", "--cases", folder, "--fake", "--report", inside];
      expect(await agentBenchCommand(testConsole.services, context, args, output)).toBe(1);
      expect(printed.stderr.at(-1)).toBe("Refused: the report must be outside the repository.");
      expect(existsSync(inside)).toBe(false);
      expect(await organizations()).toBe(0);

      // The real model needs its key.
      expect(await agentBenchCommand(testConsole.services, context, ["--report", reportFile], output)).toBe(1);
      expect(printed.stderr.at(-1)).toContain("AI_*");
      // Anything else is the usage.
      expect(await agentBenchCommand(testConsole.services, context, ["--dir", folder], output)).toBe(1);
      expect(printed.stderr.at(-1)).toContain("Usage: agent-bench");

      printed.stdout = [];
      const play = ["--", "--cases", folder, "--fake", "--report", reportFile];
      expect(await agentBenchCommand(testConsole.services, context, play, output)).toBe(1);
      expect(printed.stdout).toContain("pass  holds  sent");
      expect(printed.stdout).toContain("FAIL  breaks  move");
      expect(printed.stdout).toContain(`Report: ${reportFile}`);
      expect(printed.stdout.at(-1)).toBe("1 check(s) failed.");
      // Only names: never what was said or answered.
      const shown = printed.stdout.join("\n");
      expect(shown).not.toContain("Namaste");
      expect(shown).not.toContain("Greetings");

      expect(statSync(dirname(reportFile)).mode & 0o777).toBe(0o700);
      const report = modeAndText(reportFile);
      expect(report.mode).toBe(0o600);
      expect(report.text).toContain(spoken);
      expect(report.text).toContain(replied);
      expect(await organizations()).toBe(0);
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });

  it("passes with no failing check, and writes the default report under the home folder", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    const server = createTestServer({}, { dbUrls: database.urls });
    const testConsole = createTestConsole(server);
    try {
      const { printed, output } = printing();
      const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
      const cases = join(home, "agent-cases");
      const context = {
        ai: null,
        databaseUrls: ["postgresql://u:p@localhost:5432/db"],
        repositoryRoot,
        home,
        now: new Date("2026-11-13T09:05:00Z"),
      };
      const { mkdirSync } = await import("node:fs");
      mkdirSync(cases);
      writeFileSync(join(cases, "one.json"), JSON.stringify(aCase("holds", "greet")));
      expect(await agentBenchCommand(testConsole.services, context, ["--fake"], output)).toBe(0);
      expect(printed.stdout.at(-1)).toBe("All cases passed.");
      expect(existsSync(join(home, "agent-bench", "2026-11-13T09-05-00Z.md"))).toBe(true);
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });
});

describe("the agent-bench process", () => {
  const output = () => {
    const printed = { stdout: [] as string[], stderr: [] as string[] };
    return {
      printed,
      out: {
        stdout: (line: string) => printed.stdout.push(line),
        stderr: (line: string) => printed.stderr.push(line),
      },
    };
  };
  const options = (variables: Record<string, string>, home: string, build?: AgentBenchProcessOptions["build"]) => ({
    variables,
    repositoryRoot,
    home,
    now: new Date("2026-11-13T09:05:00Z"),
    ...(build === undefined ? {} : { build }),
  });

  it("starts with only the two database addresses set: no storage, mail, push or auth settings", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    try {
      const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
      const folder = mkdtempSync(join(tmpdir(), "agent-bench-cases-"));
      writeFileSync(join(folder, "one.json"), JSON.stringify(aCase("holds", "greet")));
      const { printed, out } = output();
      const variables = { DATABASE_URL: database.urls.runtime, DATABASE_PLATFORM_URL: database.urls.platform };
      const args = ["--cases", folder, "--fake", "--report", join(home, "r", "bench.md")];
      expect(await runAgentBench(args, out, options(variables, home))).toBe(0);
      expect(printed.stdout.at(-1)).toBe("All cases passed.");
    } finally {
      await database.drop();
    }
  });

  it("refuses a database that is not here before anything connects", async () => {
    const built: string[] = [];
    const { printed, out } = output();
    const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
    const spy = () => {
      built.push("built");
      return Promise.reject(new Error("must not be built"));
    };
    for (const variables of [
      {
        DATABASE_URL: "postgresql://u:p@localhost:5432/db",
        DATABASE_PLATFORM_URL: "postgresql://u:p@db.example.com/db",
      },
      {
        DATABASE_URL: "postgresql://u:p@db.example.com/db",
        DATABASE_PLATFORM_URL: "postgresql://u:p@localhost:5432/db",
      },
      {},
    ]) {
      expect(await runAgentBench(["--fake"], out, options(variables, home, spy))).toBe(1);
      expect(printed.stderr.at(-1)).toContain("not on this computer");
    }
    expect(built).toEqual([]);
  });

  it("names a setting that does not fit, never its value", async () => {
    const { printed, out } = output();
    const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
    const variables = {
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      DATABASE_PLATFORM_URL: "postgresql://u:p@localhost:5432/db",
      AI_BASE_URL: "not a url with secret-value",
    };
    const spy = () => Promise.reject(new Error("must not be built"));
    expect(await runAgentBench(["--fake"], out, options(variables, home, spy))).toBe(1);
    expect(printed.stderr.join("\n")).toContain("AI_BASE_URL");
    expect(printed.stderr.join("\n")).not.toContain("secret-value");
  });

  it("a case that throws prints only its name and the error's name, and the organization is still removed", async () => {
    const database = await createIsolatedDatabase(inject("dbUrls"));
    const server = createTestServer({}, { dbUrls: database.urls });
    const testConsole = createTestConsole(server);
    try {
      const { printed, output: out } = printing();
      const home = mkdtempSync(join(tmpdir(), "agent-bench-home-"));
      const folder = mkdtempSync(join(tmpdir(), "agent-bench-cases-"));
      const reportFile = join(mkdtempSync(join(tmpdir(), "agent-bench-report-")), "bench.md");
      writeFileSync(join(folder, "one.json"), JSON.stringify(aCase("breaks badly", "greet")));
      writeFileSync(join(folder, "two.json"), "{ not json");
      const exploding = {
        configured: true,
        complete: () => Promise.reject(new TypeError(`the model choked on: ${spoken}`)),
      };
      const context = {
        ai: exploding,
        databaseUrls: ["postgresql://u:p@localhost:5432/db"],
        repositoryRoot,
        home,
        now: new Date("2026-11-13T09:05:00Z"),
      };
      const run = await agentBenchCommand(
        testConsole.services,
        context,
        ["--cases", folder, "--report", reportFile],
        out,
      );
      expect(run).toBe(1);
      expect(printed.stdout).toContain("FAIL  breaks badly  error TypeError");
      expect(printed.stdout).toContain("FAIL  two.json  not a valid case file");
      expect(printed.stdout.join("\n")).not.toContain("choked");
      expect(printed.stdout.join("\n")).not.toContain("Namaste");
      const report = readFileSync(reportFile, "utf8");
      expect(report).toContain("FAIL  error TypeError");
      expect(report).not.toContain("choked");
      expect(await testConsole.services.platformDb.transaction((tx) => tx.organization.count())).toBe(0);
    } finally {
      await testConsole.close();
      await server.close();
      await database.drop();
    }
  });
});
