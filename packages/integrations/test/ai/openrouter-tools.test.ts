// Native tool calling through the OpenRouter adapter: tools and reasoning sent as OpenRouter takes them, tool calls and
// reasoning details read and sent back unchanged, a 400 to a request with tools final, and each try bounded by the
// request's own timeout and deadline. Also the in-memory model's scripted tool calls.
import { describe, expect, it } from "vitest";
import {
  createMemoryAiModel,
  createOpenRouterModel,
  type AiMessage,
  type AiRequest,
  type AiTool,
} from "../../src/ai/index.js";

const KEY = "sk-or-secret-key-1234567890";
const schema = {
  type: "object",
  properties: { trip_id: { type: "string", enum: ["T1", "T2"] } },
  required: ["trip_id"],
};
const quoteTool: AiTool = {
  name: "quote",
  description: "The price of a trip for these travellers.",
  parameters: schema,
};
const question = [{ role: "user" as const, content: "Kedarkantha kitne ka hai?" }];
const request: AiRequest = { feature: "sales_agent", messages: question, tools: [quoteTool], toolChoice: "auto" };
const models = { sales_agent: ["g/lite", "g/flash"] };

/** A fetch that answers each request in turn (a completion, or a bare status), keeping the bodies it was sent. */
function fakeFetch(...replies: (object | number)[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = (_url, init) => {
    bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>);
    const reply = replies.shift() ?? 503;
    return Promise.resolve(
      typeof reply === "number" ? new Response("no", { status: reply }) : new Response(JSON.stringify(reply)),
    );
  };
  return { fetcher, bodies };
}
const completion = (message: object, finishReason = "stop", usage: object = {}) => ({
  model: "g/lite",
  usage,
  choices: [{ message, finish_reason: finishReason }],
});
const words = (text: string, finishReason = "stop") => completion({ content: text }, finishReason);
const modelWith = (fetcher: typeof fetch) => createOpenRouterModel({ apiKey: KEY, models, fetch: fetcher });

describe("native tool calling through the OpenRouter adapter", () => {
  it("sends tools as functions and tool_choice auto, and never parallel_tool_calls", async () => {
    const { fetcher, bodies } = fakeFetch(words("Hi"));
    await modelWith(fetcher).complete(request);
    expect(bodies[0]?.tools).toEqual([
      { type: "function", function: { name: "quote", description: quoteTool.description, parameters: schema } },
    ]);
    expect(bodies[0]?.tool_choice).toBe("auto");
    expect(bodies[0]).not.toHaveProperty("parallel_tool_calls");
  });

  it("sends no tools, tool_choice or parallel_tool_calls on a request without tools", async () => {
    const { fetcher, bodies } = fakeFetch(words("Hi"), words("Hi"));
    await modelWith(fetcher).complete({ feature: "sales_agent", messages: question, toolChoice: "auto" });
    await modelWith(fetcher).complete({ ...request, tools: [] });
    for (const body of bodies) {
      for (const key of ["tools", "tool_choice", "parallel_tool_calls"]) expect(body).not.toHaveProperty(key);
    }
  });

  it("sends reasoning effort, and no sampling setting it wasn't given", async () => {
    const { fetcher, bodies } = fakeFetch(words("Hi"));
    await modelWith(fetcher).complete({ ...request, reasoning: { effort: "low" }, maxTokens: 8000 });
    const body = bodies[0] ?? {};
    expect(body).toMatchObject({
      reasoning: { effort: "low" },
      max_tokens: 8000,
      provider: { zdr: true, require_parameters: true },
    });
    for (const key of ["temperature", "top_p", "top_k"]) expect(key in body).toBe(false);
  });

  it("takes an answer with tool calls and no words as an answer, asking no other model", async () => {
    const reasoning = [{ type: "reasoning.encrypted", data: "x" }];
    const { fetcher, bodies } = fakeFetch(
      completion(
        {
          content: null,
          tool_calls: [{ id: "c1", type: "function", function: { name: "quote", arguments: '{"trip_id":"T1"}' } }],
          reasoning_details: reasoning,
        },
        "tool_calls",
      ),
    );
    expect(await modelWith(fetcher).complete(request)).toMatchObject({
      ok: true,
      text: "",
      finishReason: "tool_calls",
      toolCalls: [{ id: "c1", name: "quote", arguments: '{"trip_id":"T1"}' }],
      reasoningDetails: reasoning,
    });
    expect(bodies).toHaveLength(1);
    // An answer with neither words nor tool calls is still empty: the next model is asked.
    const empty = fakeFetch(completion({ content: "  " }), words("Hi"));
    expect(await modelWith(empty.fetcher).complete(request)).toMatchObject({ ok: true, text: "Hi" });
    expect(empty.bodies.map((body) => body.model)).toEqual(["g/lite", "g/flash"]);
  });

  it("sends an assistant's tool calls and reasoning back unchanged, and each tool result by its call's id", async () => {
    const reasoning = [{ type: "reasoning.encrypted", data: "x", id: "r1", format: "google-gemini-v1", index: 0 }];
    const messages: AiMessage[] = [
      ...question,
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "quote", arguments: '{"trip_id":"T9"}' }],
        reasoningDetails: reasoning,
      },
      { role: "tool", toolCallId: "c1", content: "refused: T9 isn't one of the trips; the trips are T1, T2" },
    ];
    const { fetcher, bodies } = fakeFetch(words("Hi"));
    await modelWith(fetcher).complete({ ...request, messages });
    const sent = bodies[0]?.messages as unknown[];
    expect(sent[0]).toEqual({ role: "user", content: "Kedarkantha kitne ka hai?" });
    expect(sent[1]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", type: "function", function: { name: "quote", arguments: '{"trip_id":"T9"}' } }],
      reasoning_details: reasoning,
    });
    expect(sent[2]).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: "refused: T9 isn't one of the trips; the trips are T1, T2",
    });
  });

  it("reads cached and reasoning tokens and times the try", async () => {
    const usage = {
      prompt_tokens: 9000,
      completion_tokens: 420,
      prompt_tokens_details: { cached_tokens: 6000 },
      completion_tokens_details: { reasoning_tokens: 300 },
    };
    const { fetcher } = fakeFetch(completion({ content: "Hi" }, "stop", usage));
    const result = await modelWith(fetcher).complete(request);
    expect(result).toMatchObject({
      ok: true,
      inputTokens: 9000,
      outputTokens: 420,
      cachedTokens: 6000,
      reasoningTokens: 300,
      finishReason: "stop",
    });
    expect(result.ok ? result.ms : undefined).toBeGreaterThanOrEqual(0);
  });

  it("answers a 400 on a request with tools as bad_request, without the next model", async () => {
    const { fetcher, bodies } = fakeFetch(400, words("Hi"));
    expect(await modelWith(fetcher).complete(request)).toEqual({ ok: false, reason: "bad_request" });
    expect(bodies).toHaveLength(1);
  });

  it("still answers a 400 on a request without tools as unavailable", async () => {
    const { fetcher, bodies } = fakeFetch(400, words("Hi"));
    expect(await modelWith(fetcher).complete({ feature: "sales_agent", messages: question })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(bodies).toHaveLength(1);
  });

  it("returns finish_reason length as an answer marked length, and a reason it doesn't know as other", async () => {
    const { fetcher, bodies } = fakeFetch(words("Kedarkantha is ₹9,499 per", "length"), words("Hi", "MAX_TOKENS"));
    expect(await modelWith(fetcher).complete(request)).toMatchObject({
      ok: true,
      text: "Kedarkantha is ₹9,499 per",
      finishReason: "length",
    });
    expect(await modelWith(fetcher).complete(request)).toMatchObject({ ok: true, finishReason: "other" });
    expect(bodies).toHaveLength(2);
  });

  it("tries the next model only while 10 seconds remain before the deadline", async () => {
    const short = fakeFetch(503, words("Hi"));
    expect(await modelWith(short.fetcher).complete({ ...request, deadlineAt: Date.now() + 9_000 })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(short.bodies).toHaveLength(1);
    const long = fakeFetch(503, words("Hi"));
    expect(await modelWith(long.fetcher).complete({ ...request, deadlineAt: Date.now() + 20_000 })).toMatchObject({
      ok: true,
    });
    expect(long.bodies.map((body) => body.model)).toEqual(["g/lite", "g/flash"]);
  });

  it("counts a model resting from a 429 as no try: the next one is asked with under 10 seconds left", async () => {
    const { fetcher, bodies } = fakeFetch(429, words("First"), words("Second"));
    const model = modelWith(fetcher);
    await model.complete(request);
    expect(await model.complete({ ...request, deadlineAt: Date.now() + 9_000 })).toMatchObject({
      ok: true,
      text: "Second",
    });
    expect(bodies.map((body) => body.model)).toEqual(["g/lite", "g/flash", "g/flash"]);
  });

  it("gives a try up at the request's own timeout, never past the deadline", async () => {
    let sent = 0;
    const hanging: typeof fetch = (_url, init) => {
      sent += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The try was given up", "AbortError"));
        });
      });
    };
    const model = createOpenRouterModel({
      apiKey: KEY,
      models: { sales_agent: ["g/lite"] },
      timeoutMs: 10_000,
      fetch: hanging,
    });
    const timed = async (limits: Pick<AiRequest, "timeoutMs" | "deadlineAt">) => {
      const started = Date.now();
      const result = await model.complete({ ...request, ...limits });
      return { result, ms: Date.now() - started };
    };
    const ownTimeout = await timed({ timeoutMs: 50 });
    expect(ownTimeout.result).toEqual({ ok: false, reason: "unavailable" });
    expect(ownTimeout.ms).toBeLessThan(1_000);
    const deadline = await timed({ timeoutMs: 5_000, deadlineAt: Date.now() + 50 });
    expect(deadline.result).toEqual({ ok: false, reason: "unavailable" });
    expect(deadline.ms).toBeLessThan(1_000);
    expect(sent).toBe(2);
    // A deadline already gone sends nothing.
    expect((await timed({ deadlineAt: Date.now() - 1 })).result).toEqual({ ok: false, reason: "unavailable" });
    expect(sent).toBe(2);
  });

  it("the memory model scripts tool calls with ids and keeps every request", async () => {
    const reasoning = [{ type: "reasoning.encrypted", data: "x" }];
    const model = createMemoryAiModel();
    model.answer(
      {
        toolCalls: [
          { name: "quote", arguments: { trip_id: "T1" } },
          { name: "get_trip", arguments: { trip_id: "T2" } },
        ],
        reasoningDetails: reasoning,
      },
      { toolCalls: [{ name: "quote", arguments: { trip_id: "T2" } }], text: "One moment", model: "g/flash" },
      { text: "Cut off", finishReason: "length" },
      "Plain words",
    );
    expect(await model.complete(request)).toEqual({
      ok: true,
      text: "",
      model: "memory-model",
      inputTokens: 0,
      outputTokens: 0,
      finishReason: "tool_calls",
      toolCalls: [
        { id: "call_1", name: "quote", arguments: '{"trip_id":"T1"}' },
        { id: "call_2", name: "get_trip", arguments: '{"trip_id":"T2"}' },
      ],
      reasoningDetails: reasoning,
    });
    expect(await model.complete(request)).toMatchObject({
      text: "One moment",
      model: "g/flash",
      toolCalls: [{ id: "call_3", name: "quote", arguments: '{"trip_id":"T2"}' }],
    });
    expect(await model.complete(request)).toMatchObject({ text: "Cut off", finishReason: "length" });
    // Words alone answer exactly as before.
    expect(await model.complete(request)).toEqual({
      ok: true,
      text: "Plain words",
      model: "memory-model",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(model.requests).toHaveLength(4);
    expect(model.requests[0]?.tools).toEqual([quoteTool]);
  });
});
