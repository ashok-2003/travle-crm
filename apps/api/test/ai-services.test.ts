// Which models each AI feature gets from the settings: the new sales agent's own list (AI_AGENT_MODELS), the chat models
// when it is unset, and no call at all on an endpoint that is not OpenRouter, whatever model a request names (the agent
// sends OpenRouter's reasoning field).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiModel, type AiSettings } from "../src/ai-services.js";

const OPENROUTER = "https://openrouter.ai/api/v1";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";
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

  it("gives the backup's sales_agent its own chat models when it names them", async () => {
    const { asked } = stubFetch();
    // The first key is off OpenRouter, so only the backup answers sales_agent.
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

  it("answers not_configured for sales_agent on an endpoint that is not OpenRouter", async () => {
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
    // Nor when the request names its own model: a call pinned to a model, or Try it's Flash.
    expect(
      await google?.complete({ feature: "sales_agent", messages, user: "org", model: "gemini-3.5-flash" }),
    ).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(asked).toHaveLength(1);
  });

  it("sends every sales_agent call to an OpenRouter backup, whatever model it names", async () => {
    const { asked, fields } = stubFetch();
    const model = createAiModel(
      settings({
        AI_BASE_URL: GOOGLE,
        AI_CHAT_MODELS: ["gemini-chat"],
        AI_BACKUP_API_KEY: "sk-backup-0123456789",
        AI_BACKUP_BASE_URL: OPENROUTER,
        AI_BACKUP_CHAT_MODELS: ["google/backup-chat"],
      }),
    );
    const tool = { name: "get_trip", description: "One trip in full", parameters: { type: "object", properties: {} } };
    const agent = {
      feature: "sales_agent" as const,
      messages,
      user: "org",
      tools: [tool],
      toolChoice: "auto" as const,
      reasoning: { effort: "low" as const },
      deadlineAt: Date.now() + 120_000,
    };
    // A request that names its own model.
    expect(await model?.complete({ ...agent, model: "gemini-3.5-flash" })).toMatchObject({ ok: true });
    // A turn's first call, then the next one pinned to the model that answered it (ruling 12).
    const first = await model?.complete(agent);
    const answered = first?.ok === true ? first.model : "none";
    expect(answered).toBe("google/backup-chat");
    const pinned = [
      ...messages,
      { role: "assistant" as const, content: "", toolCalls: [{ id: "call-1", name: "get_trip", arguments: "{}" }] },
      { role: "tool" as const, content: "T1 Kedarkantha Trek", toolCallId: "call-1" },
    ];
    expect(await model?.complete({ ...agent, messages: pinned, model: answered })).toMatchObject({ ok: true });
    // Try it's Flash choice, at 0.4.
    expect(await model?.complete({ ...agent, model: "google/gemini-3.5-flash", temperature: 0.4 })).toMatchObject({
      ok: true,
    });
    expect(asked).toEqual([
      { url: `${OPENROUTER}/chat/completions`, model: "gemini-3.5-flash" },
      { url: `${OPENROUTER}/chat/completions`, model: "google/backup-chat" },
      { url: `${OPENROUTER}/chat/completions`, model: "google/backup-chat" },
      { url: `${OPENROUTER}/chat/completions`, model: "google/gemini-3.5-flash" },
    ]);
    // The other features still go to Google, and Google never gets a reasoning field or tools.
    await model?.complete({ feature: "autopilot", messages, user: "org" });
    expect(asked.at(-1)?.url).toBe(`${GOOGLE}/chat/completions`);
    for (const call of fields.filter((one) => one.url.startsWith(GOOGLE))) {
      expect(call.keys).not.toContain("reasoning");
      expect(call.keys).not.toContain("tools");
    }
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
