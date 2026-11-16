// Each natural model call counted against the month's limit, as lite's are: one call reserved for each, its tokens kept,
// given back when no model answered, and "limit", asking no model, once the month's calls are used up.
import { createMemoryAiModel, type AiRequest, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countedModel } from "../../../src/ai/natural/counted-model.js";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { anAgency, createTestImports, type TestImports } from "../../imports/support/test-imports.js";

const NOW = new Date("2026-11-14T18:13:00Z");
const ZONE = "Asia/Kolkata";
const request: AiRequest = { feature: "sales_agent", messages: [{ role: "user", content: "Kedarkantha ka rate?" }] };

/** A memory model whose answers count tokens, as a provider's do. */
function countingModel(): MemoryAiModel {
  const model = createMemoryAiModel();
  const complete = model.complete.bind(model);
  model.complete = async (asked) => {
    const result = await complete(asked);
    return result.ok ? { ...result, inputTokens: 9_000, outputTokens: 120 } : result;
  };
  return model;
}

describe("the natural agent's counted calls", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  it("reserves one of the month's calls for each and keeps its tokens; one no model answered is given back", async () => {
    const organizationId = await anAgency(test, "Case Trips");
    const model = countingModel();
    const call = countedModel(model, { db: test.db, organizationId, now: NOW, timeZone: ZONE });
    model.answer("₹9,499 per person.", { ok: false, reason: "unavailable" });
    expect(await call(request)).toMatchObject({ ok: true, text: "₹9,499 per person.", inputTokens: 9_000 });
    expect(await call(request)).toEqual({ ok: false, reason: "unavailable" });
    const usage = await test.db.forOrg(organizationId, (tx) => tx.aiUsage.findFirstOrThrow());
    expect(usage).toMatchObject({ calls: 1, inputTokens: 9_000n, outputTokens: 120n });
  });

  it("answers limit, asking no model, once the month's calls are used up", async () => {
    const organizationId = await anAgency(test, "Full Month Trips");
    await test.db.forOrg(organizationId, (tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(NOW, ZONE), calls: MONTHLY_AI_LIMIT } }),
    );
    const model = countingModel();
    model.answer("never asked");
    const call = countedModel(model, { db: test.db, organizationId, now: NOW, timeZone: ZONE });
    expect(await call(request)).toEqual({ ok: false, reason: "limit" });
    expect(model.requests).toHaveLength(0);
  });
});
