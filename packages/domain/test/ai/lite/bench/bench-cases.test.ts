// Runs every case in cases/*.json through the real lite turn with a scripted model: each case is its own test, and a new
// JSON file is picked up without code. Cases are invented (the agency "Case Holidays"); no real chat is ever kept here.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { liteCase, type handOverReasons, type LiteCase, type liteMoveKinds } from "@travel-crm/contracts/ai";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { BENCH_NOW, benchModel, runLiteCase, seedBenchAgency } from "../../../../src/ai/index.js";
import type { HandOverReason, Move } from "../../../../src/ai/lite/types.js";
import type { Entitlements } from "../../../../src/subscriptions/index.js";
import { anAgency, createTestImports, type TestImports } from "../../../imports/support/test-imports.js";

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
const cases: LiteCase[] = readdirSync(folder)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .flatMap((file) => {
    const parsed: unknown = JSON.parse(readFileSync(join(folder, file), "utf8"));
    return (Array.isArray(parsed) ? (parsed as unknown[]) : [parsed]).map((one) => liteCase.parse(one));
  });

describe("the lite bench's test chats", () => {
  let test: TestImports;
  let organizationId: string;
  const dependencies = (one: LiteCase) => ({
    db: test.db,
    ai: benchModel(one),
    subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
    agencyName: () => Promise.resolve("Case Holidays"),
    files: test.files,
    managers: () => Promise.resolve([]),
  });
  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test, "Bench agency");
    await test.db.forOrg(organizationId, (tx) => seedBenchAgency(tx, organizationId, test.storage));
  });
  afterAll(() => test.close());

  it("the contract's names are the agent's names", () => {
    expectTypeOf<Move["kind"]>().toExtend<(typeof liteMoveKinds)[number]>();
    expectTypeOf<HandOverReason>().toEqualTypeOf<(typeof handOverReasons)[number]>();
  });

  it("holds at least ten cases with their own names", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((one) => one.name)).size).toBe(cases.length);
  });

  for (const one of cases) {
    it(one.name, async () => {
      const result = await runLiteCase(dependencies(one), organizationId, one, BENCH_NOW);
      const failed = result.checks.filter((check) => !check.pass).map((check) => check.name);
      const seen = JSON.stringify(
        result.turns.map((turn) => ({ outcome: turn.outcome, move: turn.move, reason: turn.reason })),
      );
      expect(failed, seen).toEqual([]);
    });
  }

  it("a case's agency lines are not replayed", async () => {
    const one = liteCase.parse({
      name: "agency line between",
      chat: [
        { from: "customer", text: "hi" },
        { from: "agency", text: "an agency line that must not be replayed" },
        { from: "customer", text: "hello again" },
      ],
      scripted: [],
      expect: { sent: false },
    });
    const result = await runLiteCase(dependencies(one), organizationId, one, BENCH_NOW);
    expect(result.turns).toHaveLength(2);
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.whatsappMessage.count({ where: { body: "an agency line that must not be replayed" } }),
    );
    expect(stored).toBe(0);
  });
});
