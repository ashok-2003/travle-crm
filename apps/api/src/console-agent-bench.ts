// `agent-bench`: replays test chats through the lite agent against a throwaway organization on the LOCAL database and prints
// one line per case and check (names only, no chat words). The words and replies go to a private report outside the
// repository. The real model comes from .env; `--fake` runs a folder's scripted answers with no key. Nothing reaches
// WhatsApp: no worker and no outbox relay run here. Never in CI, never on a hosted database.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { liteCase, type LiteCase } from "@travel-crm/contracts/ai";
import { BENCH_NOW, benchModel, runLiteCase, seedBenchAgency, type LiteCaseResult } from "@travel-crm/domain/ai";
import { createFiles } from "@travel-crm/domain/files";
import { createCaseOrganization, removeCaseOrganization, type PlatformServices } from "@travel-crm/domain/platform";
import type { Entitlements } from "@travel-crm/domain/subscriptions";
import type { AiModel } from "@travel-crm/integrations/ai";
import { errorFields } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { benchReport, insideRepository, writePrivateReport } from "./agent-bench-report.js";
import type { CommandOutput } from "./console-commands.js";

export { insideRepository };

const USAGE = "Usage: agent-bench [-- --cases <folder of .json cases>] [--report <file>] [--fake]";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface AgentBenchContext {
  /** The real model from .env (AI_*), or null when no key is set. */
  ai: AiModel | null;
  /** Every database address the process holds: all of them must be on this computer. */
  databaseUrls: readonly string[];
  repositoryRoot: string;
  /** Where the private cases and reports live: `<home>/.config/travel-crm`. */
  home: string;
  now: Date;
}

/**
 * Whether the address surely names this computer. pg-connection-string lets a `host`, `hostaddr` or `service` query
 * parameter override the hostname, so any of them refuses the address; so does anything that does not parse.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const overridden = ["host", "hostaddr", "service"].some((key) => parsed.searchParams.has(key));
    return !overridden && LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** The cases of every .json file in the folder (a file holds one case or a list), or the file that cannot be read. */
function readCases(folder: string): { cases: LiteCase[]; unreadable: string[] } {
  const cases: LiteCase[] = [];
  const unreadable: string[] = [];
  for (const file of readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(folder, file), "utf8"));
      for (const one of Array.isArray(parsed) ? (parsed as unknown[]) : [parsed]) cases.push(liteCase.parse(one));
    } catch {
      unreadable.push(file);
    }
  }
  return { cases, unreadable };
}

const line = (pass: boolean, name: string, what: string) => `${pass ? "pass" : "FAIL"}  ${name}  ${what}`;
/** `2026-11-13T09-05-00Z`: a file name that sorts by time. */
const stamp = (at: Date) => `${at.toISOString().slice(0, 19).replaceAll(":", "-")}Z`;

export async function agentBenchCommand(
  platform: PlatformServices,
  context: AgentBenchContext,
  args: readonly string[],
  output: CommandOutput,
): Promise<number> {
  let values: { cases?: string | undefined; report?: string | undefined; fake?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: { cases: { type: "string" }, report: { type: "string" }, fake: { type: "boolean" } },
    }));
  } catch {
    output.stderr(USAGE);
    return 1;
  }
  if (!context.databaseUrls.every(isLocalDatabaseUrl)) {
    output.stderr("Refused: the database is not on this computer (localhost, 127.0.0.1 or ::1).");
    return 1;
  }
  // pnpm runs the script from apps/api; a path typed in the folder the person ran it from means that folder.
  const base = process.env.INIT_CWD ?? process.cwd();
  const reportFile = resolve(base, values.report ?? join(context.home, "agent-bench", `${stamp(context.now)}.md`));
  if (insideRepository(reportFile, context.repositoryRoot)) {
    output.stderr("Refused: the report must be outside the repository.");
    return 1;
  }
  const fake = values.fake === true;
  const model = context.ai;
  if (!fake && model?.configured !== true) {
    output.stderr("Set the AI_* variables in .env first (or use --fake for the scripted answers).");
    return 1;
  }
  const casesFolder = resolve(base, values.cases ?? join(context.home, "agent-cases"));
  let found: ReturnType<typeof readCases>;
  try {
    found = readCases(casesFolder);
  } catch {
    output.stderr("The folder could not be read.");
    return 1;
  }
  for (const file of found.unreadable) output.stdout(line(false, file, "not a valid case file"));
  if (found.cases.length === 0 && found.unreadable.length === 0) {
    output.stderr("No .json cases in that folder.");
    return 1;
  }

  const storage = createMemoryStorage();
  const files = createFiles({ db: platform.db, storage });
  const organizationId = await createCaseOrganization(platform);
  let failures = found.unreadable.length;
  const results: LiteCaseResult[] = [];
  try {
    await platform.db.forOrg(organizationId, (tx) => seedBenchAgency(tx, organizationId, storage));
    for (const one of found.cases) {
      try {
        const result = await runLiteCase(
          {
            db: platform.db,
            ai: fake || model === null ? benchModel(one) : model,
            subscriptions: { entitlementsOf: () => Promise.resolve(allEntitlements) },
            agencyName: () => Promise.resolve("Case Holidays"),
            files,
            managers: () => Promise.resolve([]),
          },
          organizationId,
          one,
          BENCH_NOW,
        );
        results.push(result);
        for (const check of result.checks) {
          output.stdout(line(check.pass, one.name, check.name));
          if (!check.pass) failures += 1;
        }
      } catch (error) {
        // The error's name and code, never its message: it can quote a customer's words.
        const what = `error ${errorFields(error).errorName}`;
        output.stdout(line(false, one.name, what));
        results.push({
          name: one.name,
          turns: [],
          checks: [{ name: what, pass: false }],
          sent: [],
          actions: { payment: false, files: false, booking: false, handOver: false },
          flagged: false,
          knows: [],
        });
        failures += 1;
      }
    }
  } finally {
    // The organization goes even when a case threw, and the run says so when it could not.
    await removeCaseOrganization(platform, organizationId).catch((error: unknown) => {
      output.stderr(`The test organization ${organizationId} could not be removed: ${errorFields(error).errorName}`);
      failures += 1;
    });
  }
  writePrivateReport(reportFile, benchReport(results, { at: context.now, fake, casesFolder }));
  output.stdout(`Report: ${reportFile}`);
  output.stdout(failures === 0 ? "All cases passed." : `${String(failures)} check(s) failed.`);
  return failures === 0 ? 0 : 1;
}

/** What the plan allows: everything, as the AI's own checks of the subscription are not under test here. */
const allEntitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Cases",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};
