// askFor: a model's answer is kept only when it fits the contract; prose or a wrong shape is "unfit", never guessed at.
import { describe, expect, it } from "vitest";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { askFor } from "../../../src/ai/grounded/ask.js";

const contract = {
  safeParse: (input: unknown) =>
    typeof input === "object" && input !== null && "place" in input && typeof input.place === "string"
      ? { success: true as const, data: { place: input.place } }
      : { success: false as const },
};
const request = {
  feature: "autopilot" as const,
  messages: [{ role: "user" as const, content: "Hi" }],
  schema: { name: "read", jsonSchema: { type: "object" } },
};

describe("askFor", () => {
  it("returns unfit for prose or a wrong shape, and the value for a fitting answer", async () => {
    const model = createMemoryAiModel();
    model.answer("Sure, happy to help!", '{"place": 3}', 'Here: ```json\n{"place":"Manali"}\n```', {
      ok: false,
      reason: "rate_limited",
    });
    // An answer that does not fit was still made: it carries what it used.
    const usage = { model: "memory-model", inputTokens: 0, outputTokens: 0 };
    expect(await askFor(model, request, contract)).toEqual({
      ok: false,
      reason: "unfit",
      raw: "Sure, happy to help!",
      usage,
    });
    expect(await askFor(model, request, contract)).toEqual({ ok: false, reason: "unfit", raw: '{"place": 3}', usage });
    expect(await askFor(model, request, contract)).toEqual({
      ok: true,
      value: { place: "Manali" },
      raw: 'Here: ```json\n{"place":"Manali"}\n```',
      model: "memory-model",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(await askFor(model, request, contract)).toEqual({ ok: false, reason: "rate_limited" });
    expect(model.requests[0]?.schema).toEqual(request.schema);
  });
});
