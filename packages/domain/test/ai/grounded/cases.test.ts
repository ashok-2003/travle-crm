// Runs every hand-written chat in cases/*.json through the grounded agent against a scripted memory model: each case is its
// own test, and a new JSON file is picked up without code. The expectations are the ones the case file states.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentCase, type AgentCase } from "@travel-crm/contracts/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CASE_NOW, runAgentCase, scriptedModel, seedCaseAgency } from "../../../src/ai/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { anAgency, createTestImports, type TestImports } from "../../imports/support/test-imports.js";

const entitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};

const folder = join(dirname(fileURLToPath(import.meta.url)), "cases");
const cases: AgentCase[] = readdirSync(folder)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .flatMap((file) => {
    const parsed: unknown = JSON.parse(readFileSync(join(folder, file), "utf8"));
    return (Array.isArray(parsed) ? (parsed as unknown[]) : [parsed]).map((one) => agentCase.parse(one));
  });

describe("the grounded agent's test chats", () => {
  let test: TestImports;
  let organizationId: string;
  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test, "Case agency");
    await test.db.forOrg(organizationId, (tx) => seedCaseAgency(tx, organizationId, test.storage));
  });
  afterAll(() => test.close());

  it("holds about twenty-five cases with their own names", () => {
    expect(cases.length).toBeGreaterThanOrEqual(24);
    expect(new Set(cases.map((one) => one.name)).size).toBe(cases.length);
  });

  for (const one of cases) {
    it(one.name, async () => {
      const result = await runAgentCase(
        {
          db: test.db,
          ai: scriptedModel(one),
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
          agencyName: () => Promise.resolve("Sharma Holidays"),
          files: test.files,
          managers: () => Promise.resolve([]),
        },
        organizationId,
        one,
        CASE_NOW,
      );
      // A failed expectation names itself and shows what happened, so the case can be fixed.
      const failed = result.checks.filter((check) => !check.pass).map((check) => check.name);
      const seen = JSON.stringify({ outcome: result.outcome, reason: result.reason, sent: result.sent });
      expect(failed, seen).toEqual([]);
    });
  }
});
