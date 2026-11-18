// Vertex AI's explicit context cache in the adapter: a big system message and its tools are made into a cache once (an
// hour), and each request names it instead of sending them; a cache that can't be made, or that Vertex refuses, costs
// one try and the request goes as before. Small requests, requests with no system message first, and anything not on
// Vertex are untouched.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterModel, type AiRequest, type AiTool, type OpenRouterOptions } from "../../src/ai/index.js";

const VERTEX = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi";
const CACHES = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/cachedContents";
const MODEL = "google/gemini-3.5-flash-lite";
const prompt = "You answer for Himalaya Treks, in the customer's own language. ".repeat(320);
const quote: AiTool = {
  name: "quote",
  description: "The price of a trip for these travellers.",
  parameters: {
    type: "object",
    properties: { trip_id: { type: "string", enum: ["T1", "T2"] } },
    required: ["trip_id"],
    additionalProperties: false,
  },
};
const question = { role: "user" as const, content: "Kedarkantha kitne ka hai?" };
const request: AiRequest = {
  feature: "sales_agent",
  messages: [{ role: "system", content: prompt }, question],
  tools: [quote],
  toolChoice: "auto",
  reasoning: { effort: "low" },
};
const cacheName = (n: number) => `projects/p/locations/global/cachedContents/cache-${String(n)}`;

/** A fake Vertex that makes caches (cache-1, cache-2...) and answers chats ("ok"), unless scripted; keeps every request. */
function fakeVertex(script: { create?: (number | Error)[]; chat?: (number | "ok")[] } = {}) {
  const sent: { url: string; body: Record<string, unknown>; authorization: string | undefined }[] = [];
  let made = 0;
  const fetcher: typeof fetch = (url, init) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
    const asked = typeof url === "string" ? url : "";
    sent.push({ url: asked, body, authorization: (init?.headers as Record<string, string>).authorization });
    const reply = (asked === CACHES ? script.create : script.chat)?.shift();
    if (reply instanceof Error) return Promise.reject(reply);
    if (typeof reply === "number") return Promise.resolve(new Response("no", { status: reply }));
    if (asked === CACHES) return Promise.resolve(Response.json({ name: cacheName((made += 1)) }));
    return Promise.resolve(
      Response.json({ model: MODEL, choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] }),
    );
  };
  return {
    fetcher,
    caches: () => sent.filter((one) => one.url === CACHES),
    chats: () => sent.filter((one) => one.url !== CACHES).map((one) => one.body),
  };
}
const vertexModel = (fetcher: typeof fetch, options: Partial<OpenRouterOptions> = {}) =>
  createOpenRouterModel({
    apiKey: () => Promise.resolve("ya29.token"),
    models: { sales_agent: [MODEL] },
    baseUrl: VERTEX,
    fetch: fetcher,
    ...options,
  });
const named = (n: number) => ({ extra_body: { google: { cached_content: cacheName(n) } } });

afterEach(() => {
  vi.useRealTimers();
});

describe("Vertex AI's context cache in the adapter", () => {
  it("makes a cache of the system message and tools once, and sends the rest naming it", async () => {
    const vertex = fakeVertex();
    const model = vertexModel(vertex.fetcher);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Hi" });
    // A tool round: the call's thought signature still goes back with it, through the same cache.
    const call = {
      id: "c1",
      name: "quote",
      arguments: '{"trip_id":"T1"}',
      providerData: { extra_content: { google: { thought_signature: "sig" } } },
    };
    const round = [
      { role: "assistant" as const, content: "", toolCalls: [call] },
      { role: "tool" as const, content: "₹9,499", toolCallId: "c1" },
    ];
    await model.complete({ ...request, messages: [...request.messages, ...round] });

    expect(vertex.caches()).toEqual([
      {
        url: CACHES,
        authorization: "Bearer ya29.token",
        body: {
          model: "projects/p/locations/global/publishers/google/models/gemini-3.5-flash-lite",
          systemInstruction: { parts: [{ text: prompt }] },
          tools: [
            {
              functionDeclarations: [
                { name: "quote", description: quote.description, parametersJsonSchema: quote.parameters },
              ],
            },
          ],
          ttl: "3600s",
        },
      },
    ]);
    const [first, second] = vertex.chats();
    expect(first).toMatchObject({ model: MODEL, messages: [question], reasoning_effort: "low", ...named(1) });
    expect(second?.messages).toEqual([
      question,
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            extra_content: { google: { thought_signature: "sig" } },
            id: "c1",
            type: "function",
            function: { name: "quote", arguments: '{"trip_id":"T1"}' },
          },
        ],
      },
      { role: "tool", content: "₹9,499", tool_call_id: "c1" },
    ]);
    for (const chat of [first, second]) {
      expect(chat).toMatchObject(named(1));
      for (const key of ["tools", "tool_choice"]) expect(chat).not.toHaveProperty(key);
    }
  });

  it("makes one cache for calls that arrive together", async () => {
    const vertex = fakeVertex();
    const model = vertexModel(vertex.fetcher);
    await Promise.all([model.complete(request), model.complete(request), model.complete(request)]);
    expect(vertex.caches()).toHaveLength(1);
    expect(vertex.chats()).toMatchObject([named(1), named(1), named(1)]);
  });

  it("caches a big system message with no tools, and leaves the request with no tools", async () => {
    const vertex = fakeVertex();
    await vertexModel(vertex.fetcher).complete({ feature: "sales_agent", messages: request.messages });
    expect(vertex.caches()[0]?.body).not.toHaveProperty("tools");
    expect(vertex.chats()[0]).toMatchObject({ messages: [question], ...named(1) });
  });

  it("leaves a small, system-less or tool-choice-none request alone, and anything not on Vertex", async () => {
    const small = { ...request, messages: [{ role: "system" as const, content: "Short." }, question] };
    const noSystem = { ...request, messages: [{ ...question, content: prompt }] };
    const none = { ...request, toolChoice: "none" as const };
    const vertex = fakeVertex();
    for (const asked of [small, noSystem, none]) await vertexModel(vertex.fetcher).complete(asked);
    // A key (AI Studio, the backup), another address, or a model not named publisher/id.
    await vertexModel(vertex.fetcher, { apiKey: "AIza-key-0123456789" }).complete(request);
    await vertexModel(vertex.fetcher, { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" }).complete(
      request,
    );
    await vertexModel(vertex.fetcher, { models: { sales_agent: ["gemini-3.5-flash-lite"] } }).complete(request);
    expect(vertex.caches()).toEqual([]);
    for (const chat of vertex.chats()) {
      expect(chat).not.toHaveProperty("extra_body");
      expect(chat).toHaveProperty("tools");
    }
    expect(vertex.chats().map((chat) => (chat.messages as { role: string }[])[0]?.role)).toEqual([
      "system",
      "user",
      "system",
      "system",
      "system",
      "system",
    ]);
  });

  it("sends the request as before, remembering nothing, when the cache can't be made", async () => {
    const vertex = fakeVertex({ create: [500, new Error("socket hang up")] });
    const model = vertexModel(vertex.fetcher);
    for (let i = 0; i < 3; i += 1) expect(await model.complete(request)).toMatchObject({ ok: true, text: "Hi" });
    expect(vertex.caches()).toHaveLength(3);
    const [first, second, third] = vertex.chats();
    for (const uncached of [first, second]) {
      expect(uncached).toMatchObject({
        messages: [{ role: "system", content: prompt }, question],
        tool_choice: "auto",
      });
      expect(uncached).not.toHaveProperty("extra_body");
    }
    expect(third).toMatchObject(named(1));
  });

  it("forgets a cache Vertex refuses (404 or 400), asking the same model once more without it", async () => {
    const vertex = fakeVertex({ chat: [404, "ok", 400] });
    const model = vertexModel(vertex.fetcher);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Hi" });
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Hi" });
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Hi" });
    const chats = vertex.chats();
    expect(chats.map((chat) => (chat.extra_body === undefined ? "uncached" : JSON.stringify(chat.extra_body)))).toEqual(
      [
        JSON.stringify(named(1).extra_body),
        "uncached",
        JSON.stringify(named(2).extra_body),
        "uncached",
        JSON.stringify(named(3).extra_body),
      ],
    );
    expect(chats[1]).toMatchObject({ messages: [{ role: "system" }, question], tool_choice: "auto" });
  });

  it("makes a new cache when the one it has has under five minutes left", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-18T10:00:00Z") });
    const vertex = fakeVertex();
    const model = vertexModel(vertex.fetcher);
    await model.complete(request);
    vi.setSystemTime(new Date("2026-11-18T10:54:00Z"));
    await model.complete(request);
    vi.setSystemTime(new Date("2026-11-18T10:56:00Z"));
    await model.complete(request);
    expect(vertex.chats()).toMatchObject([named(1), named(1), named(2)]);
  });

  it("keeps 50 caches at most, dropping the oldest", async () => {
    const vertex = fakeVertex();
    const model = vertexModel(vertex.fetcher);
    const agency = (n: number): AiRequest => ({
      ...request,
      messages: [{ role: "system", content: `${prompt} Agency ${String(n)}.` }, question],
    });
    for (let n = 1; n <= 51; n += 1) await model.complete(agency(n));
    await model.complete(agency(51));
    await model.complete(agency(1));
    expect(vertex.caches()).toHaveLength(52);
    expect(vertex.chats().slice(-2)).toMatchObject([named(51), named(52)]);
  });
});
