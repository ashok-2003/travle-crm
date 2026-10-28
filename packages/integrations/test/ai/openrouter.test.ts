// The OpenRouter adapter: zero-data-retention routing on every request, OpenRouter's address only, a feature's models
// tried in order, and the key sent as a header and nowhere else.
import { describe, expect, it } from "vitest";
import { createOpenRouterModel, openRouterBaseUrl } from "../../src/ai/index.js";

const KEY = "sk-or-secret-key-1234567890";
const messages = [{ role: "user" as const, content: "Hello" }];

function fakeFetch(...replies: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = (url, init) => {
    calls.push({ url: typeof url === "string" ? url : "", init: init ?? {} });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("unexpected call");
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  };
  return { fetcher, calls };
}
const answer = (text: string, model = "m") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content: text }, finish_reason: "stop" }] }));
const bodyOf = (call: { init: RequestInit }) =>
  JSON.parse(typeof call.init.body === "string" ? call.init.body : "{}") as Record<string, unknown>;

describe("the OpenRouter adapter", () => {
  it("asks for zero data retention on every request, with the key in the header only", async () => {
    const { fetcher, calls } = fakeFetch(answer("Hi there"));
    const model = createOpenRouterModel({
      apiKey: KEY,
      models: { suggest_reply: ["a/one"], score_lead: ["s/one"], autopilot: [], learn: [] },
      fetch: fetcher,
    });
    expect(await model.complete({ feature: "suggest_reply", messages, user: "org-1" })).toEqual({
      ok: true,
      text: "Hi there",
      model: "m",
      inputTokens: 0,
      outputTokens: 0,
    });
    const call = calls[0];
    if (call === undefined) throw new Error("no request was sent");
    expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(bodyOf(call)).toMatchObject({ model: "a/one", provider: { zdr: true }, user: "org-1" });
    expect(JSON.stringify(bodyOf(call))).not.toContain(KEY);
    expect((call.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it("refuses any base URL that is not OpenRouter's", () => {
    for (const url of [
      "https://api.openai.com/v1",
      "http://openrouter.ai/api/v1",
      "https://openrouter.ai.evil.example/v1",
      "https://user:pass@openrouter.ai/api/v1",
      "not a url",
    ]) {
      expect(() => openRouterBaseUrl(url)).toThrow();
      expect(() =>
        createOpenRouterModel({
          apiKey: KEY,
          models: { suggest_reply: ["a"], score_lead: ["s"], autopilot: [], learn: [] },
          baseUrl: url,
        }),
      ).toThrow();
    }
    expect(openRouterBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
  });

  it("tries the next model when one is rate limited, and says so when none answers", async () => {
    const first = fakeFetch(new Response("", { status: 429 }), answer("From the fallback", "b/two"));
    const model = createOpenRouterModel({
      apiKey: KEY,
      models: { suggest_reply: ["a/one", "b/two"], score_lead: [], autopilot: [], learn: [] },
      fetch: first.fetcher,
    });
    expect(await model.complete({ feature: "suggest_reply", messages })).toMatchObject({ ok: true, model: "b/two" });
    expect(first.calls.map((call) => bodyOf(call).model)).toEqual(["a/one", "b/two"]);

    const none = fakeFetch(new Response("", { status: 429 }), new Response("", { status: 503 }));
    const limited = createOpenRouterModel({
      apiKey: KEY,
      models: { suggest_reply: ["a/one", "b/two"], score_lead: [], autopilot: [], learn: [] },
      fetch: none.fetcher,
    });
    expect(await limited.complete({ feature: "suggest_reply", messages })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("says unavailable for a failure, and never leaks the key in what it returns", async () => {
    const { fetcher } = fakeFetch(new Error(`connect failed for ${KEY}`));
    const model = createOpenRouterModel({
      apiKey: KEY,
      models: { suggest_reply: ["a/one"], score_lead: ["s/one"], autopilot: [], learn: [] },
      fetch: fetcher,
    });
    const result = await model.complete({ feature: "suggest_reply", messages });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("is not configured without a key or a model, and sends nothing", async () => {
    const { fetcher, calls } = fakeFetch();
    for (const options of [
      { apiKey: "", models: { suggest_reply: ["a"], score_lead: ["s"], autopilot: [], learn: [] } },
      { apiKey: KEY, models: { suggest_reply: [], score_lead: [], autopilot: [], learn: [] } },
    ]) {
      const model = createOpenRouterModel({ ...options, fetch: fetcher });
      expect(await model.complete({ feature: "suggest_reply", messages })).toEqual({
        ok: false,
        reason: "not_configured",
      });
    }
    expect(calls).toHaveLength(0);
  });
});
