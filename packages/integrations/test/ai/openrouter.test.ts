// The OpenRouter adapter: zero-data-retention routing on every request, OpenRouter's address only, a feature's models
// tried in order, and the key sent as a header and nowhere else.
import { describe, expect, it } from "vitest";
import { aiBaseUrl, createOpenRouterModel, isOpenRouterUrl } from "../../src/ai/index.js";

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

  it("sends OpenRouter's provider field to OpenRouter alone, never to Google's or any other endpoint", async () => {
    const models = { suggest_reply: ["gemini-2.5-flash"], score_lead: [], autopilot: [], learn: [] };
    const google = fakeFetch(answer("From Gemini", "gemini-2.5-flash"));
    const gemini = createOpenRouterModel({
      apiKey: KEY,
      models,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      fetch: google.fetcher,
    });
    expect(await gemini.complete({ feature: "suggest_reply", messages, json: true, user: "org-1" })).toMatchObject({
      ok: true,
    });
    const call = google.calls[0];
    if (call === undefined) throw new Error("no request was sent");
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(bodyOf(call)).not.toHaveProperty("provider");
    expect(bodyOf(call)).toMatchObject({ model: "gemini-2.5-flash", response_format: { type: "json_object" } });
    // An address that only looks like OpenRouter's gets nothing of it either, and OpenRouter's own can turn it off.
    for (const url of ["https://openrouter.ai.evil.example/v1", "http://openrouter.ai/api/v1"]) {
      const other = fakeFetch(answer("x", "m"));
      await createOpenRouterModel({ apiKey: KEY, models, baseUrl: url, fetch: other.fetcher }).complete({
        feature: "suggest_reply",
        messages,
      });
      expect(bodyOf(other.calls[0] ?? call)).not.toHaveProperty("provider");
    }
    const off = fakeFetch(answer("x", "m"));
    await createOpenRouterModel({ apiKey: KEY, models, zeroRetention: false, fetch: off.fetcher }).complete({
      feature: "suggest_reply",
      messages,
    });
    expect(bodyOf(off.calls[0] ?? call)).not.toHaveProperty("provider");
  });

  it("refuses an address that is no http(s) URL or holds credentials", () => {
    for (const url of ["not a url", "ftp://example.com/v1", "https://user:pass@example.com/v1"]) {
      expect(() => aiBaseUrl(url)).toThrow();
    }
    expect(aiBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
    expect(isOpenRouterUrl("https://openrouter.ai/api/v1")).toBe(true);
    expect(isOpenRouterUrl("https://openrouter.ai.evil.example/v1")).toBe(false);
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

  it("sends a recording and a screenshot as the endpoint's parts, and words alone as a plain string", async () => {
    const { fetcher, calls } = fakeFetch(answer("{}"));
    const model = createOpenRouterModel({
      apiKey: KEY,
      models: { fill_form: ["gemini-x"] },
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      fetch: fetcher,
    });
    await model.complete({
      feature: "fill_form",
      messages: [
        { role: "system", content: "Fill the form." },
        {
          role: "user",
          content: "Here it is",
          attachments: [
            { type: "audio", format: "wav", bytes: new Uint8Array([1, 2, 3]) },
            { type: "image", mimeType: "image/png", bytes: new Uint8Array([4, 5]) },
          ],
        },
      ],
    });
    const call = calls[0];
    if (call === undefined) throw new Error("no request was sent");
    const sent = bodyOf(call).messages as { content: unknown }[];
    expect(sent[0]?.content).toBe("Fill the form.");
    expect(sent[1]?.content).toEqual([
      { type: "text", text: "Here it is" },
      { type: "input_audio", input_audio: { data: "AQID", format: "wav" } },
      { type: "image_url", image_url: { url: "data:image/png;base64,BAU=" } },
    ]);
  });
});
