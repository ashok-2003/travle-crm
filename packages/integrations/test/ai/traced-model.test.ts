// The traced AI model: every call is one model-call observation named for its feature (and its answer's schema), with the
// messages it was sent (an image or a recording as a placeholder), its answer, the model that gave it and the tokens, or
// ERROR and the reason. The call itself is untouched: the request reaches the model as it came, extra fields and all, and
// the result comes back as the model gave it, even when the tracing breaks.
import { describe, expect, it } from "vitest";
import { createMemoryAiModel, withTracing, type AiModel, type AiRequest } from "../../src/ai/index.js";
import { createMemoryTracing, type AiTracing } from "../../src/tracing/index.js";

const request: AiRequest = {
  feature: "suggest_reply",
  messages: [
    { role: "system", content: "You draft replies." },
    {
      role: "user",
      content: "What does this say?",
      attachments: [{ type: "image", mimeType: "image/jpeg", bytes: new Uint8Array(2048) }],
    },
  ],
  user: "org-1",
};

describe("the traced AI model", () => {
  it("records a call as a generation with its messages, answer, model and tokens", async () => {
    const tracing = createMemoryTracing();
    const inner = createMemoryAiModel();
    inner.answer("Hello there");
    const model = withTracing(inner, tracing);
    expect(model.configured).toBe(true);
    expect(await model.complete({ ...request, maxTokens: 300, temperature: 0.4, model: "flash" })).toEqual({
      ok: true,
      text: "Hello there",
      model: "memory-model",
      inputTokens: 0,
      outputTokens: 0,
    });
    const [call] = tracing.generations;
    expect(call?.start).toEqual({
      name: "ai.suggest_reply",
      input: [
        { role: "system", content: "You draft replies." },
        {
          role: "user",
          content: [
            { type: "text", text: "What does this say?" },
            { type: "text", text: "[image image/jpeg, 2 KB]" },
          ],
        },
      ],
      model: "flash",
      modelParameters: { max_tokens: 300, temperature: 0.4 },
      metadata: { feature: "suggest_reply", organizationId: "org-1", json: false, schema: null },
    });
    expect(call?.end).toEqual({ output: "Hello there", model: "memory-model", usage: { input: 0, output: 0 } });
  });

  it("names a call by its answer's schema too", async () => {
    const tracing = createMemoryTracing();
    const inner = createMemoryAiModel();
    inner.answer("{}");
    const schema = { name: "understand_form", jsonSchema: { type: "object" } };
    await withTracing(inner, tracing).complete({ feature: "autopilot", messages: [], schema });
    expect(tracing.generations[0]?.start).toMatchObject({
      name: "ai.autopilot.understand_form",
      metadata: { schema: "understand_form", json: true },
    });
    // The schema itself is code's, the same for every call of a prompt version: it is not repeated on each call.
    expect(tracing.generations[0]?.start.metadata).not.toHaveProperty("jsonSchema");
  });

  it("marks a call with no answer as an error with its reason", async () => {
    const tracing = createMemoryTracing();
    const inner = createMemoryAiModel();
    inner.answer({ ok: false, reason: "rate_limited" });
    expect(await withTracing(inner, tracing).complete(request)).toEqual({ ok: false, reason: "rate_limited" });
    expect(tracing.generations[0]?.end).toEqual({ level: "ERROR", statusMessage: "rate_limited" });
  });

  it("hands a thrown error back, after marking the call", async () => {
    const tracing = createMemoryTracing();
    const error = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    const failing: AiModel = { configured: true, complete: () => Promise.reject(error) };
    await expect(withTracing(failing, tracing).complete(request)).rejects.toBe(error);
    expect(tracing.generations[0]?.end).toEqual({ level: "ERROR", statusMessage: "Error ECONNRESET" });
  });

  it("passes fields it doesn't know through, both ways", async () => {
    const seen: unknown[] = [];
    const answer = {
      ok: true as const,
      text: "x",
      model: "m",
      inputTokens: 1,
      outputTokens: 2,
      toolCalls: [{ id: "1" }],
    };
    const inner: AiModel = {
      configured: true,
      complete: (sent) => {
        seen.push(sent);
        return Promise.resolve(answer);
      },
    };
    const withTools = { ...request, tools: [{ name: "find_packages" }] };
    expect(await withTracing(inner, createMemoryTracing()).complete(withTools)).toBe(answer);
    expect(seen[0]).toBe(withTools);
  });

  it("answers as the model does when the tracing itself breaks", async () => {
    const broken: AiTracing = {
      turn: (_start, work) => work(),
      note: () => undefined,
      step: (_start, work) => work(),
      generation: () => {
        throw new Error("tracing down");
      },
      flush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const inner = createMemoryAiModel();
    inner.answer("Still here");
    expect(await withTracing(inner, broken).complete(request)).toMatchObject({ ok: true, text: "Still here" });
  });
});
