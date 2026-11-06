// `agent-cases`: plays hand-written WhatsApp chats through the grounded agent against a throwaway organization on the LOCAL
// database and prints one line per case and expectation. Real cases (private, outside the repository) run with the real
// model from .env; `--fake` runs a folder's cases with their scripted answers and no key. Never in CI, never on a hosted database.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { agentCase, type AgentCase } from "@travel-crm/contracts/ai";
import { CASE_NOW, runAgentCase, scriptedModel, seedCaseAgency, type CaseResult } from "@travel-crm/domain/ai";
import { createFiles } from "@travel-crm/domain/files";
import type { Entitlements } from "@travel-crm/domain/subscriptions";
import { createCaseOrganization, removeCaseOrganization, type PlatformServices } from "@travel-crm/domain/platform";
import type { AiModel } from "@travel-crm/integrations/ai";
import { errorFields } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import type { CommandOutput } from "./console-commands.js";

const USAGE = "Usage: agent-cases [-- --dir <folder of .json cases>] [--fake]";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** The repository's own cases, from apps/api. */
const REPOSITORY_CASES = resolve(import.meta.dirname, "../../../packages/domain/test/ai/grounded/cases");

export interface AgentCasesContext {
  /** The real model from .env (AI_*), or null when no key is set. */
  ai: AiModel | null;
  /** Every database address the process holds: all of them must be on this computer. */
  databaseUrls: readonly string[];
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/** The cases of every .json file in the folder (a file holds one case or a list), or the file that cannot be read. */
function readCases(folder: string): { cases: AgentCase[]; unreadable: string[] } {
  const cases: AgentCase[] = [];
  const unreadable: string[] = [];
  for (const file of readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(folder, file), "utf8"));
      for (const one of Array.isArray(parsed) ? (parsed as unknown[]) : [parsed]) cases.push(agentCase.parse(one));
    } catch {
      unreadable.push(file);
    }
  }
  return { cases, unreadable };
}

const line = (pass: boolean, name: string, what: string) => `${pass ? "pass" : "FAIL"}  ${name}  ${what}`;

export async function agentCasesCommand(
  platform: PlatformServices,
  context: AgentCasesContext,
  args: readonly string[],
  output: CommandOutput,
): Promise<number> {
  let values: { dir?: string | undefined; fake?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: { dir: { type: "string" }, fake: { type: "boolean" } },
    }));
  } catch {
    output.stderr(USAGE);
    return 1;
  }
  if (!context.databaseUrls.every((url) => LOCAL_HOSTS.has(hostOf(url)))) {
    output.stderr("Refused: the database is not on this computer (localhost, 127.0.0.1 or ::1).");
    return 1;
  }
  const fake = values.fake === true;
  const model = context.ai;
  if (!fake && model?.configured !== true) {
    output.stderr("Set the AI_* variables in .env first (or use --fake for the scripted answers).");
    return 1;
  }
  let found: ReturnType<typeof readCases>;
  try {
    found = readCases(resolve(values.dir ?? REPOSITORY_CASES));
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
  try {
    await platform.db.forOrg(organizationId, (tx) => seedCaseAgency(tx, organizationId, storage));
    for (const one of found.cases) {
      let result: CaseResult | null = null;
      try {
        result = await runAgentCase(
          {
            db: platform.db,
            ai: fake || model === null ? scriptedModel(one) : model,
            subscriptions: { entitlementsOf: () => Promise.resolve(allEntitlements) },
            agencyName: () => Promise.resolve("Case Holidays"),
            files,
            managers: () => Promise.resolve([]),
          },
          organizationId,
          one,
          CASE_NOW,
        );
      } catch (error) {
        // The error's name and code, never its message: it can quote a customer's words.
        output.stdout(line(false, one.name, `error ${errorFields(error).errorName}`));
        failures += 1;
      }
      for (const check of result?.checks ?? []) {
        output.stdout(line(check.pass, one.name, check.name));
        if (!check.pass) failures += 1;
      }
    }
  } finally {
    // The organization goes even when a case threw, and the run says so when it could not.
    await removeCaseOrganization(platform, organizationId).catch((error: unknown) => {
      output.stderr(`The test organization ${organizationId} could not be removed: ${errorFields(error).errorName}`);
      failures += 1;
    });
  }
  output.stdout(failures === 0 ? "All cases passed." : `${String(failures)} expectation(s) failed.`);
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
