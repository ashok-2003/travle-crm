// Which models each AI feature gets from the settings: the new sales agent's own list (AI_AGENT_MODELS), the chat models
// when it is unset, and the same on Gemini direct (allowed for the proof of concept, 2026-11-17: no gate) and on Vertex AI
// with a service account's token (ruling R14). Every call is traced.
import type * as ai from "@travel-crm/integrations/ai";
import { createMemoryTracing } from "@travel-crm/integrations/tracing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiModel, type AiSettings } from "../src/ai-services.js";

/** The service account's token as Google would mint it, and the keys it was asked for (the real one is tested live). */
const tokenKeys = vi.hoisted((): unknown[] => []);
vi.mock("@travel-crm/integrations/ai", async (original) => ({
  ...(await original<typeof ai>()),
  serviceAccountToken: (key: unknown) => {
    tokenKeys.push(key);
    return () => Promise.resolve("ya29.vertex-token");
  },
}));

const OPENROUTER = "https://openrouter.ai/api/v1";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";
const VERTEX = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi";
const messages = [{ role: "user" as const, content: "Hello" }];

/** Answers every call, and notes the address and model of each, and the fields each body sent. */
function stubFetch(): { asked: { url: string; model: unknown }[]; fields: { url: string; keys: string[] }[] } {
  const asked: { url: string; model: unknown }[] = [];
  const fields: { url: string; keys: string[] }[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { model?: unknown };
    asked.push({ url, model: body.model });
    fields.push({ url, keys: Object.keys(body) });
    return Promise.resolve(
      new Response(
        JSON.stringify({ model: body.model, choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] }),
      ),
    );
  });
  return { asked, fields };
}

const settings = (extra: Partial<AiSettings>): AiSettings => ({
  AI_API_KEY: "sk-first-0123456789",
  AI_BASE_URL: OPENROUTER,
  AI_CHAT_MODELS: ["google/chat-one", "google/chat-two"],
  AI_SUGGEST_MODELS: ["google/suggest"],
  AI_SCORE_MODELS: ["google/score"],
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sales agent's models", () => {
  it("gives sales_agent AI_AGENT_MODELS, and the chat models when it is unset", async () => {
    const { asked } = stubFetch();
    const own = createAiModel(settings({ AI_AGENT_MODELS: ["google/agent-one"] }));
    await own?.complete({ feature: "sales_agent", messages, user: "org" });
    // Lite's autopilot keeps the chat models.
    await own?.complete({ feature: "autopilot", messages, user: "org" });
    const plain = createAiModel(settings({}));
    await plain?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked.map((call) => call.model)).toEqual(["google/agent-one", "google/chat-one", "google/chat-one"]);

    // On OpenRouter's own key, the suggest models stand in for the chat ones.
    const keyed = createAiModel({
      OPENROUTER_API_KEY: "sk-or-0123456789abcdef",
      AI_SUGGEST_MODELS: ["a/suggest"],
      AI_SCORE_MODELS: ["a/score"],
    });
    await keyed?.complete({ feature: "sales_agent", messages, user: "org" });
    const keyedOwn = createAiModel({
      OPENROUTER_API_KEY: "sk-or-0123456789abcdef",
      AI_SUGGEST_MODELS: ["a/suggest"],
      AI_SCORE_MODELS: ["a/score"],
      AI_AGENT_MODELS: ["a/agent"],
    });
    await keyedOwn?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked.slice(3).map((call) => call.model)).toEqual(["a/suggest", "a/agent"]);
  });

  it("sends sales_agent to Gemini direct like any other feature, whatever model a request names", async () => {
    const { asked, fields } = stubFetch();
    const google = createAiModel(settings({ AI_BASE_URL: GOOGLE, AI_AGENT_MODELS: ["gemini-3.5-flash"] }));
    const agent = {
      feature: "sales_agent" as const,
      messages,
      user: "org",
      reasoning: { effort: "low" as const },
    };
    expect(await google?.complete(agent)).toMatchObject({ ok: true });
    expect(await google?.complete({ ...agent, model: "gemini-3.5-pro" })).toMatchObject({ ok: true });
    expect(asked).toEqual([
      { url: `${GOOGLE}/chat/completions`, model: "gemini-3.5-flash" },
      { url: `${GOOGLE}/chat/completions`, model: "gemini-3.5-pro" },
    ]);
    // Google gets its own form of the effort, and none of OpenRouter's fields.
    for (const call of fields) {
      expect(call.keys).toContain("reasoning_effort");
      expect(call.keys).not.toContain("reasoning");
      expect(call.keys).not.toContain("provider");
    }
  });

  it("traces a sales_agent call on Gemini direct as a generation", async () => {
    stubFetch();
    const tracing = createMemoryTracing();
    const google = createAiModel(settings({ AI_BASE_URL: GOOGLE }), tracing);
    await google?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(tracing.generations.map((call) => [call.start.name, call.end])).toEqual([
      ["ai.sales_agent", { output: "Hi", model: "google/chat-one", usage: { input: 0, output: 0 } }],
    ]);
  });
});

describe("Vertex AI", () => {
  it("sends every feature to the Vertex endpoint with the service account's token as the bearer", async () => {
    const headers: string[] = [];
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      urls.push(url);
      headers.push((init.headers as Record<string, string>).authorization ?? "");
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "Hi" } }] })));
    });
    const key = { client_email: "agent@veeper-ai.iam.gserviceaccount.com", private_key: "pem" };
    const vertex = createAiModel(
      settings({ AI_API_KEY: undefined, AI_VERTEX_SERVICE_ACCOUNT: key, AI_BASE_URL: VERTEX }),
    );
    await vertex?.complete({ feature: "sales_agent", messages, user: "org" });
    await vertex?.complete({ feature: "suggest_reply", messages, user: "org" });
    expect(tokenKeys).toEqual([key]);
    expect(urls).toEqual([`${VERTEX}/chat/completions`, `${VERTEX}/chat/completions`]);
    expect(headers).toEqual(["Bearer ya29.vertex-token", "Bearer ya29.vertex-token"]);
  });
});
