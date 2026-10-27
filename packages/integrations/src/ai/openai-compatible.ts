// The AI adapter for any OpenAI-compatible chat completions endpoint (ADR 0029): OpenRouter (the default, with its
// zero-data-retention routing), Google's Gemini (generativelanguage.googleapis.com/v1beta/openai) or Groq. The models
// are configuration: each tier's list is tried in order, the next one when a model is rate limited, overloaded or gone,
// so changing a model is a change of setting, not of code.
import type { AiModel, AiRequest, AiResult } from "./ai-model.js";

export interface OpenAiCompatibleOptions {
  /** e.g. https://openrouter.ai/api/v1 (no trailing slash needed). */
  baseUrl: string;
  apiKey: string;
  models: { chat: readonly string[]; fast: readonly string[] };
  /**
   * OpenRouter only: route to providers that keep no data (ADR 0029: `zdr`). Free models are seldom served so; turned
   * off for trying the AI for free, the provider may keep what it is sent.
   */
  zeroRetention?: boolean;
  /** Milliseconds before one model's try is given up. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Statuses after which the next model is tried. */
const TRY_NEXT = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export function createOpenAiCompatibleModel(options: OpenAiCompatibleOptions): AiModel {
  const send = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const openRouter = base.includes("openrouter.ai");
  const models = {
    chat: options.models.chat.length > 0 ? options.models.chat : options.models.fast,
    fast: options.models.fast.length > 0 ? options.models.fast : options.models.chat,
  };
  return {
    configured: options.apiKey !== "" && models.chat.length > 0,
    models,
    async complete(request: AiRequest): Promise<AiResult> {
      const list = models[request.tier];
      if (options.apiKey === "" || list.length === 0) return { ok: false, reason: "not_configured" };
      let limited = false;
      for (const model of list) {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, options.timeoutMs ?? 45_000);
        try {
          const response = await send(`${base}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
            body: JSON.stringify({
              model,
              messages: request.messages,
              max_tokens: request.maxTokens ?? 800,
              ...(request.json === true ? { response_format: { type: "json_object" } } : {}),
              ...(request.user === undefined ? {} : { user: request.user }),
              // OpenRouter only: route to providers that keep no data (ADR 0029), unless turned off.
              ...(openRouter && options.zeroRetention !== false
                ? { provider: { zdr: true, require_parameters: true } }
                : {}),
            }),
          });
          if (!response.ok) {
            if (response.status === 429) limited = true;
            if (TRY_NEXT.has(response.status) || response.status === 404) continue;
            return { ok: false, reason: "unavailable" };
          }
          const body = (await response.json()) as ChatCompletion;
          const choice = body.choices?.[0];
          const text = choice?.message?.content ?? "";
          if (choice?.finish_reason === "content_filter") return { ok: false, reason: "refused" };
          if (text.trim() === "") continue;
          return {
            ok: true,
            text,
            model: body.model ?? model,
            inputTokens: body.usage?.prompt_tokens ?? 0,
            outputTokens: body.usage?.completion_tokens ?? 0,
          };
        } catch {
          // A timeout or a network failure: the next model may answer.
          continue;
        } finally {
          clearTimeout(timer);
        }
      }
      return { ok: false, reason: limited ? "rate_limited" : "unavailable" };
    },
  };
}
