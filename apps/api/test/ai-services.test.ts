// Which models each AI feature gets from the settings: the new sales agent's own list (AI_AGENT_MODELS), the chat models
// when it is unset, and none at all on an endpoint that is not OpenRouter (the agent sends OpenRouter's reasoning fields).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiModel, type AiSettings } from "../src/ai-services.js";

const OPENROUTER = "https://openrouter.ai/api/v1";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";
const messages = [{ role: "user" as const, content: "Hello" }];

/** Answers every call, and notes the address and model of each. */
function stubFetch(): { asked: { url: string; model: unknown }[] } {
  const asked: { url: string; model: unknown }[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { model?: unknown };
    asked.push({ url, model: body.model });
    return Promise.resolve(
      new Response(
        JSON.stringify({ model: body.model, choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] }),
      ),
    );
  });
  return { asked };
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

  it("gives the backup's sales_agent its own chat models when it names them", async () => {
    const { asked } = stubFetch();
    // The first key has no sales_agent model (an endpoint off OpenRouter), so only the backup answers.
    const named = createAiModel(
      settings({
        AI_BASE_URL: GOOGLE,
        AI_BACKUP_API_KEY: "sk-backup-0123456789",
        AI_BACKUP_BASE_URL: OPENROUTER,
        AI_BACKUP_CHAT_MODELS: ["google/backup-chat"],
        AI_AGENT_MODELS: ["google/agent-one"],
      }),
    );
    await named?.complete({ feature: "sales_agent", messages, user: "org" });
    // Unnamed, the backup takes the agent's models, else the chat ones.
    const inherits = createAiModel(
      settings({ AI_BACKUP_API_KEY: "sk-backup-0123456789", AI_AGENT_MODELS: ["google/agent-one"] }),
    );
    await inherits?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked).toEqual([
      { url: `${OPENROUTER}/chat/completions`, model: "google/backup-chat" },
      { url: `${OPENROUTER}/chat/completions`, model: "google/agent-one" },
    ]);
  });

  it("gives sales_agent no models on an endpoint that is not OpenRouter, so it answers not_configured", async () => {
    const { asked } = stubFetch();
    const google = createAiModel(settings({ AI_BASE_URL: GOOGLE, AI_AGENT_MODELS: ["gemini-3.5-flash"] }));
    expect(await google?.complete({ feature: "sales_agent", messages, user: "org" })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    // The other features still run there.
    expect(await google?.complete({ feature: "autopilot", messages, user: "org" })).toMatchObject({ ok: true });
    // A backup that inherits Google's address is judged by it too.
    const both = createAiModel(settings({ AI_BASE_URL: GOOGLE, AI_BACKUP_API_KEY: "sk-backup-0123456789" }));
    expect(await both?.complete({ feature: "sales_agent", messages, user: "org" })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(asked).toHaveLength(1);
  });

  it("serves sales_agent from the backup alone when only the backup is on OpenRouter", async () => {
    const { asked } = stubFetch();
    const model = createAiModel(
      settings({
        AI_BASE_URL: GOOGLE,
        AI_CHAT_MODELS: ["gemini-chat"],
        AI_BACKUP_API_KEY: "sk-backup-0123456789",
        AI_BACKUP_BASE_URL: OPENROUTER,
        AI_BACKUP_CHAT_MODELS: ["google/backup-chat"],
      }),
    );
    expect(await model?.complete({ feature: "sales_agent", messages, user: "org" })).toMatchObject({ ok: true });
    expect(asked).toEqual([{ url: `${OPENROUTER}/chat/completions`, model: "google/backup-chat" }]);
    // And the reverse: a first key on OpenRouter, a backup off it, serves from the first and never asks the backup.
    asked.length = 0;
    const reverse = createAiModel(
      settings({
        AI_BACKUP_API_KEY: "sk-backup-0123456789",
        AI_BACKUP_BASE_URL: GOOGLE,
        AI_BACKUP_CHAT_MODELS: ["gemini-chat"],
      }),
    );
    await reverse?.complete({ feature: "sales_agent", messages, user: "org" });
    expect(asked.map((call) => call.url)).toEqual([`${OPENROUTER}/chat/completions`]);
  });
});
