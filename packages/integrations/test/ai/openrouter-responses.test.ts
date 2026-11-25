// The WhatsApp agent's turns on a reasoning model (gpt-5-mini on Azure AI Foundry) go to the Responses API, the one that
// returns the model's reasoning summary: the body as Responses takes it, the answer, its usage and its summary read back,
// a length stop, a refusal, and errors and rate limits as on Chat Completions. Every other request stays on Chat
// Completions.
import { describe, expect, it } from "vitest";
import { createOpenRouterModel, type AiRequest, type AiTool } from "../../src/ai/index.js";

const AZURE = "https://example.services.ai.azure.com/openai/v1";
const KEY = "azure-secret-key-1234567890";
const reasoningModel = { effort: "medium" as const, maxCompletionTokens: 16_000 };
const quoteTool: AiTool = {
  name: "quote",
  description: "The price of a trip for these travellers.",
  parameters: { type: "object", properties: { trip_id: { type: "string" } }, required: ["trip_id"] },
};

function fakeFetch(...replies: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = (url, init) => {
    calls.push({ url: typeof url === "string" ? url : "", init: init ?? {} });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("unexpected call");
    return Promise.resolve(reply);
  };
  return { fetcher, calls };
}
const bodyOf = (call: { init: RequestInit } | undefined) =>
  JSON.parse(typeof call?.init.body === "string" ? call.init.body : "{}") as Record<string, unknown>;
const json = (body: object) => new Response(JSON.stringify(body));
const chatAnswer = (text: string) =>
  json({ model: "m", choices: [{ message: { content: text }, finish_reason: "stop" }] });

/** A Responses reply: a reasoning item with its summary, the words, and any function calls. */
const reply = (text: string, extra: object = {}) =>
  json({
    status: "completed",
    model: "gpt-5-mini-2025-08-07",
    output: [
      {
        type: "reasoning",
        id: "rs_1",
        summary: [
          {
            type: "summary_text",
            text: "**Choosing a voice**\n\nThe agent's gender isn't set, so I'll avoid gendered verbs.",
          },
          { type: "summary_text", text: "**Pricing**\n\nThe quote tool gives the price." },
        ],
      },
      ...(text === "" ? [] : [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }]),
    ],
    ...extra,
  });

function azureModel(fetcher: typeof fetch, models: Record<string, string[]> = { sales_agent: ["our-gpt-5-mini"] }) {
  return createOpenRouterModel({ apiKey: KEY, baseUrl: AZURE, models, reasoningModel, fetch: fetcher });
}

const turn: AiRequest = {
  feature: "sales_agent",
  messages: [
    { role: "system", content: "You are the agency's WhatsApp agent." },
    { role: "user", content: "Kedarkantha kitne ka hai?" },
    {
      role: "assistant",
      content: "Checking.",
      toolCalls: [{ id: "call_a", name: "quote", arguments: '{"trip_id":"T1"}' }],
      reasoningDetails: [{ opaque: true }],
      model: "our-gpt-5-mini",
    },
    { role: "tool", content: "T1: ₹12,500 per person", toolCallId: "call_a" },
  ],
  tools: [quoteTool],
  toolChoice: "auto",
  maxTokens: 900,
  reasoning: { effort: "low" },
  temperature: 0.3,
  user: "org-1",
};

describe("the agent's turns on a reasoning model, by the Responses API", () => {
  it("sends the turn as Responses takes it, with the reasoning summary asked for and nothing stored", async () => {
    const { fetcher, calls } = fakeFetch(reply("₹12,500 per person."));
    await azureModel(fetcher).complete(turn);
    expect(calls[0]?.url).toBe(`${AZURE}/responses`);
    expect(bodyOf(calls[0])).toEqual({
      model: "our-gpt-5-mini",
      input: [
        { role: "system", content: "You are the agency's WhatsApp agent." },
        { role: "user", content: "Kedarkantha kitne ka hai?" },
        { role: "assistant", content: "Checking." },
        { type: "function_call", call_id: "call_a", name: "quote", arguments: '{"trip_id":"T1"}' },
        { type: "function_call_output", call_id: "call_a", output: "T1: ₹12,500 per person" },
      ],
      tools: [
        {
          type: "function",
          name: "quote",
          description: quoteTool.description,
          parameters: quoteTool.parameters,
          strict: false,
        },
      ],
      tool_choice: "auto",
      // The reasoning model's own room and effort, whatever the request asks; no temperature.
      max_output_tokens: 16_000,
      reasoning: { effort: "medium", summary: "auto" },
      store: false,
      prompt_cache_key: "sales_agent:org-1",
      user: "org-1",
    });
    expect(JSON.stringify(bodyOf(calls[0]))).not.toContain(KEY);
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it("sends a call's tool calls alone when it said nothing, no tools without them, and an image as input_image", async () => {
    const { fetcher, calls } = fakeFetch(reply("Hi"));
    await azureModel(fetcher).complete({
      feature: "sales_agent",
      messages: [
        {
          role: "user",
          content: "Is this the trek?",
          attachments: [{ type: "image", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }],
        },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "quote", arguments: "{}" }] },
        { role: "tool", content: "ok", toolCallId: "c1" },
      ],
      maxTokens: 20_000,
    });
    const body = bodyOf(calls[0]);
    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Is this the trek?" },
          { type: "input_image", image_url: "data:image/png;base64,AQID" },
        ],
      },
      { type: "function_call", call_id: "c1", name: "quote", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "ok" },
    ]);
    expect(body).toMatchObject({ max_output_tokens: 20_000, prompt_cache_key: "sales_agent:none" });
    for (const key of ["tools", "tool_choice", "user"]) expect(body).not.toHaveProperty(key);
  });

  it("keeps every other request on Chat Completions: another feature, a recording, and a model that doesn't reason", async () => {
    const { fetcher, calls } = fakeFetch(chatAnswer("a"), chatAnswer("b"), chatAnswer("c"));
    const models = { sales_agent: ["our-gpt-5-mini"], suggest_reply: ["our-gpt-5-mini"] };
    await azureModel(fetcher, models).complete({ ...turn, feature: "suggest_reply" });
    const voice = { type: "audio" as const, format: "ogg" as const, bytes: new Uint8Array(4) };
    await azureModel(fetcher, models).complete({
      feature: "sales_agent",
      messages: [{ role: "user", content: "Voice note.", attachments: [voice] }],
    });
    const gemini = createOpenRouterModel({
      apiKey: KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      models: { sales_agent: ["gemini-3.5-flash"] },
      fetch: fetcher,
    });
    await gemini.complete(turn);
    expect(calls.map((call) => call.url)).toEqual([
      `${AZURE}/chat/completions`,
      `${AZURE}/chat/completions`,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ]);
  });

  it("reads the words, the calls, the usage and the reasoning summary, under the name it asked", async () => {
    const { fetcher } = fakeFetch(
      json({
        status: "completed",
        output: [
          { type: "reasoning", summary: [{ type: "summary_text", text: "**Look up the price**" }] },
          { type: "message", content: [{ type: "output_text", text: "One moment." }] },
          { type: "function_call", id: "fc_1", call_id: "call_x", name: "quote", arguments: '{"trip_id":"T2"}' },
        ],
        usage: {
          input_tokens: 12_000,
          input_tokens_details: { cached_tokens: 11_000 },
          output_tokens: 700,
          output_tokens_details: { reasoning_tokens: 640 },
        },
      }),
    );
    expect(await azureModel(fetcher).complete(turn)).toEqual({
      ok: true,
      text: "One moment.",
      model: "our-gpt-5-mini",
      inputTokens: 12_000,
      outputTokens: 700,
      toolCalls: [{ id: "call_x", name: "quote", arguments: '{"trip_id":"T2"}' }],
      finishReason: "tool_calls",
      cachedTokens: 11_000,
      reasoningTokens: 640,
      ms: expect.any(Number) as number,
      reasoningSummary: "**Look up the price**",
    });
  });

  it("joins the summary's parts with blank lines, and adds no summary when there is none", async () => {
    const { fetcher } = fakeFetch(
      reply("Hi"),
      json({ output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }] }),
    );
    const model = azureModel(fetcher);
    const first = await model.complete(turn);
    expect(first).toMatchObject({ ok: true, text: "Hi", finishReason: "stop" });
    expect(first.ok && first.reasoningSummary).toBe(
      "**Choosing a voice**\n\nThe agent's gender isn't set, so I'll avoid gendered verbs.\n\n" +
        "**Pricing**\n\nThe quote tool gives the price.",
    );
    const second = await model.complete(turn);
    expect(second).toMatchObject({ ok: true, text: "Hello" });
    expect(second).not.toHaveProperty("reasoningSummary");
  });

  it("reads an answer cut off at max_output_tokens as a length stop, and one stopped by the filter as refused", async () => {
    const { fetcher } = fakeFetch(
      reply("Kedarkantha is", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
      reply("", { status: "incomplete", incomplete_details: { reason: "content_filter" } }),
    );
    const model = azureModel(fetcher);
    expect(await model.complete(turn)).toMatchObject({ ok: true, text: "Kedarkantha is", finishReason: "length" });
    expect(await model.complete(turn)).toEqual({ ok: false, reason: "refused" });
  });

  it("answers an empty reply to a request with tools as an empty answer, as on Chat Completions", async () => {
    const { fetcher } = fakeFetch(reply(""));
    expect(await azureModel(fetcher).complete(turn)).toMatchObject({ ok: true, text: "", finishReason: "stop" });
  });

  it("rests a rate-limited model and asks the next, both by Responses, and answers a 400 with tools as bad_request", async () => {
    const told: unknown[] = [];
    const { fetcher, calls } = fakeFetch(
      new Response("slow down", { status: 429, headers: { "retry-after": "120" } }),
      reply("From the second"),
      reply("Again the second"),
      new Response("bad", { status: 400 }),
    );
    const model = createOpenRouterModel({
      apiKey: KEY,
      baseUrl: AZURE,
      models: { sales_agent: ["first", "second"] },
      reasoningModel,
      fetch: fetcher,
      onRateLimited: (event) => told.push(event),
    });
    expect(await model.complete(turn)).toMatchObject({ ok: true, text: "From the second", model: "second" });
    expect(told).toEqual([{ model: "first", feature: "sales_agent", restMs: 120_000 }]);
    // The first rests: the next call goes straight to the second.
    expect(await model.complete(turn)).toMatchObject({ ok: true, text: "Again the second" });
    expect(await model.complete(turn)).toEqual({ ok: false, reason: "bad_request" });
    expect(calls.map((call) => [call.url, bodyOf(call).model])).toEqual([
      [`${AZURE}/responses`, "first"],
      [`${AZURE}/responses`, "second"],
      [`${AZURE}/responses`, "second"],
      [`${AZURE}/responses`, "second"],
    ]);
  });

  it("answers rate_limited when every model said 429, and unavailable after a server error or a network failure", async () => {
    const limited = fakeFetch(new Response("", { status: 429 }));
    expect(await azureModel(limited.fetcher).complete(turn)).toEqual({ ok: false, reason: "rate_limited" });
    const down = fakeFetch(new Response("", { status: 503 }));
    expect(await azureModel(down.fetcher).complete(turn)).toEqual({ ok: false, reason: "unavailable" });
    const broken: typeof fetch = () => Promise.reject(new Error(`connect failed ${KEY}`));
    expect(await azureModel(broken).complete(turn)).toEqual({ ok: false, reason: "unavailable" });
  });
});
