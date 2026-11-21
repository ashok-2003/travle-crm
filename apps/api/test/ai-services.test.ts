// Which models each AI feature gets from the settings: the new sales agent's own list (AI_AGENT_MODELS), the chat models
// when it is unset, and the same on Gemini direct (allowed for the proof of concept, 2026-11-17: no gate) and on Vertex AI
// with a service account's token (ruling R14). Every call is traced.
import type * as ai from "@travel-crm/integrations/ai";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryTracing } from "@travel-crm/integrations/tracing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiModel, type AiSettings } from "../src/ai-services.js";

/** The service account's token as Google would mint it, and what it was made with (the real one is tested live). */
const tokenMade = vi.hoisted((): unknown[][] => []);
vi.mock("@travel-crm/integrations/ai", async (original) => ({
  ...(await original<typeof ai>()),
  serviceAccountToken: (...made: unknown[]) => {
    tokenMade.push(made);
    return () => Promise.resolve("ya29.vertex-token");
  },
}));
const logger = createMemoryLogger();

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
    const own = createAiModel(settings({ AI_AGENT_MODELS: ["google/agent-one"] }), logger);
    await own?.complete({ feature: "sales_agent", messages, user: "org" });
    // Lite's autopilot keeps the chat models.
    await own?.complete({ feature: "autopilot", messages, user: "org" });
    const plain = createAiModel(settings({}), logger);
    await plain?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked.map((call) => call.model)).toEqual(["google/agent-one", "google/chat-one", "google/chat-one"]);

    // On OpenRouter's own key, the suggest models stand in for the chat ones.
    const keyed = createAiModel(
      {
        OPENROUTER_API_KEY: "sk-or-0123456789abcdef",
        AI_SUGGEST_MODELS: ["a/suggest"],
        AI_SCORE_MODELS: ["a/score"],
      },
      logger,
    );
    await keyed?.complete({ feature: "sales_agent", messages, user: "org" });
    const keyedOwn = createAiModel(
      {
        OPENROUTER_API_KEY: "sk-or-0123456789abcdef",
        AI_SUGGEST_MODELS: ["a/suggest"],
        AI_SCORE_MODELS: ["a/score"],
        AI_AGENT_MODELS: ["a/agent"],
      },
      logger,
    );
    await keyedOwn?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked.slice(3).map((call) => call.model)).toEqual(["a/suggest", "a/agent"]);
  });

  it("gives voice notes, photos and the chat summary their own lists, else the agent's, else what the agent falls back to", async () => {
    const { asked } = stubFetch();
    const uses = ["agent_voice", "agent_image", "chat_summary"] as const;
    const modelsOf = async (model: ReturnType<typeof createAiModel>) => {
      const models: unknown[] = [];
      for (const feature of uses) {
        await model?.complete({ feature, messages, user: "org" });
        models.push(asked.at(-1)?.model);
      }
      return models;
    };
    const own = { AI_VOICE_MODELS: ["g/voice"], AI_IMAGE_MODELS: ["g/image"], AI_SUMMARY_MODELS: ["g/summary"] };
    expect(await modelsOf(createAiModel(settings({ ...own, AI_AGENT_MODELS: ["g/agent"] }), logger))).toEqual([
      "g/voice",
      "g/image",
      "g/summary",
    ]);
    expect(await modelsOf(createAiModel(settings({ AI_AGENT_MODELS: ["g/agent"] }), logger))).toEqual([
      "g/agent",
      "g/agent",
      "g/agent",
    ]);
    expect(await modelsOf(createAiModel(settings({}), logger))).toEqual([
      "google/chat-one",
      "google/chat-one",
      "google/chat-one",
    ]);
    const openRouter = {
      OPENROUTER_API_KEY: "sk-or-0123456789abcdef",
      AI_SUGGEST_MODELS: ["a/suggest"],
      AI_SCORE_MODELS: ["a/score"],
    };
    expect(await modelsOf(createAiModel({ ...openRouter, ...own }, logger))).toEqual([
      "g/voice",
      "g/image",
      "g/summary",
    ]);
    expect(await modelsOf(createAiModel(openRouter, logger))).toEqual(["a/suggest", "a/suggest", "a/suggest"]);
  });

  it("sends sales_agent to Gemini direct like any other feature, whatever model a request names", async () => {
    const { asked, fields } = stubFetch();
    const google = createAiModel(settings({ AI_BASE_URL: GOOGLE, AI_AGENT_MODELS: ["gemini-3.5-flash"] }), logger);
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
    const google = createAiModel(settings({ AI_BASE_URL: GOOGLE }), logger, tracing);
    await google?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(tracing.generations.map((call) => [call.start.name, call.end])).toEqual([
      ["ai.sales_agent", { output: "Hi", model: "google/chat-one", usage: { input: 0, output: 0 } }],
    ]);
  });
});

describe("the backup keys", () => {
  it("asks AI_BACKUP_API_KEY_2 last, on the backup's endpoint and models, only when it is set", async () => {
    const asked: { url: string; bearer: string; model: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const bearer = (init.headers as Record<string, string>).authorization ?? "";
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { model?: unknown };
      asked.push({ url, bearer, model: body.model });
      const answer = { model: body.model, choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] };
      // Only the second backup key answers.
      return Promise.resolve(
        bearer.endsWith("third-0123456789")
          ? new Response(JSON.stringify(answer))
          : new Response("busy", { status: 503 }),
      );
    });
    const backups = {
      AI_CHAT_MODELS: ["google/chat-one"],
      AI_BACKUP_API_KEY: "AIza-second-0123456789",
      AI_BACKUP_BASE_URL: GOOGLE,
      AI_BACKUP_CHAT_MODELS: ["gemini-3.5-flash-lite"],
    };
    const request = { feature: "sales_agent" as const, messages, user: "org" };
    expect(await createAiModel(settings(backups), logger)?.complete(request)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(asked).toHaveLength(2);
    const three = createAiModel(settings({ ...backups, AI_BACKUP_API_KEY_2: "AIza-third-0123456789" }), logger);
    expect(await three?.complete(request)).toMatchObject({ ok: true, model: "gemini-3.5-flash-lite" });
    expect(asked.slice(2)).toEqual([
      { url: `${OPENROUTER}/chat/completions`, bearer: "Bearer sk-first-0123456789", model: "google/chat-one" },
      { url: `${GOOGLE}/chat/completions`, bearer: "Bearer AIza-second-0123456789", model: "gemini-3.5-flash-lite" },
      { url: `${GOOGLE}/chat/completions`, bearer: "Bearer AIza-third-0123456789", model: "gemini-3.5-flash-lite" },
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
    const key = { client_email: "agent@example-project.iam.gserviceaccount.com", private_key: "pem" };
    const vertex = createAiModel(
      settings({ AI_API_KEY: undefined, AI_VERTEX_SERVICE_ACCOUNT: key, AI_BASE_URL: VERTEX }),
      logger,
    );
    await vertex?.complete({ feature: "sales_agent", messages, user: "org" });
    await vertex?.complete({ feature: "suggest_reply", messages, user: "org" });
    // Made once, with the process's logger for a failure to mint.
    expect(tokenMade).toEqual([[key, logger]]);
    expect(urls).toEqual([`${VERTEX}/chat/completions`, `${VERTEX}/chat/completions`]);
    expect(headers).toEqual(["Bearer ya29.vertex-token", "Bearer ya29.vertex-token"]);
  });

  it("makes no model, and mints no token, when the service account has no AI_BASE_URL (never OpenRouter's address)", () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      fetched.push(url);
      return Promise.resolve(new Response("{}"));
    });
    const before = tokenMade.length;
    const key = { client_email: "agent@example-project.iam.gserviceaccount.com", private_key: "pem" };
    expect(
      createAiModel(
        settings({ AI_API_KEY: undefined, AI_VERTEX_SERVICE_ACCOUNT: key, AI_BASE_URL: undefined }),
        logger,
      ),
    ).toBeNull();
    expect(tokenMade.length).toBe(before);
    expect(fetched).toEqual([]);
  });
});
