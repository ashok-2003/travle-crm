// The AI adapter for OpenRouter (ADR 0029). Every request asks OpenRouter to route only to providers that keep no data
// (`provider.zdr`), and any other base URL is refused when the adapter is made, so a setting can never send an agency's
// customers' words somewhere that is not covered. Each feature's models are configuration: its list is tried in order,
// the next one when a model is rate limited, overloaded or gone. The key is sent as a header and appears nowhere else:
// not in a message, a log or an error.
import type { AiModel, AiRequest, AiResult, AiFeature } from "./ai-model.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterOptions {
  apiKey: string;
  /** Each feature's models, the preferred one first, then its fallbacks. */
  models: Readonly<Record<AiFeature, readonly string[]>>;
  /** Only OpenRouter's own address is accepted; a test server may be given as long as it is on openrouter.ai. */
  baseUrl?: string;
  /** Milliseconds before one model's try is given up. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/** Statuses after which the next model is tried. */
const TRY_NEXT = new Set([404, 408, 409, 429, 500, 502, 503, 504, 529]);

/** The base URL, if it is OpenRouter's (https, host openrouter.ai). */
export function openRouterBaseUrl(baseUrl: string = OPENROUTER_BASE_URL): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("The AI base URL is not a URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || url.username !== "" || url.password !== "") {
    throw new Error("AI requests go to OpenRouter only (https://openrouter.ai), which keeps no data");
  }
  return baseUrl.replace(/\/+$/, "");
}

export function createOpenRouterModel(options: OpenRouterOptions): AiModel {
  const base = openRouterBaseUrl(options.baseUrl);
  const send = options.fetch ?? fetch;
  return {
    configured: options.apiKey !== "" && Object.values(options.models).some((list) => list.length > 0),
    async complete(request: AiRequest): Promise<AiResult> {
      const list = options.models[request.feature];
      if (options.apiKey === "" || list.length === 0) return { ok: false, reason: "not_configured" };
      let limited = false;
      for (const model of list) {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, options.timeoutMs ?? 30_000);
        try {
          const response = await send(`${base}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
            body: JSON.stringify({
              model,
              messages: request.messages,
              max_tokens: request.maxTokens ?? 500,
              ...(request.json === true ? { response_format: { type: "json_object" } } : {}),
              ...(request.user === undefined ? {} : { user: request.user }),
              // Zero data retention on every request, and only providers that honour all the parameters sent.
              provider: { zdr: true, require_parameters: true },
            }),
          });
          if (!response.ok) {
            if (response.status === 429) limited = true;
            if (TRY_NEXT.has(response.status)) continue;
            return { ok: false, reason: "unavailable" };
          }
          const body = (await response.json()) as ChatCompletion;
          const choice = body.choices?.[0];
          if (choice?.finish_reason === "content_filter") return { ok: false, reason: "refused" };
          const text = choice?.message?.content ?? "";
          if (text.trim() === "") continue;
          return { ok: true, text, model: body.model ?? model };
        } catch {
          // A timeout or a network failure: the next model may answer. Nothing of the error is kept: it could name the request.
          continue;
        } finally {
          clearTimeout(timer);
        }
      }
      return { ok: false, reason: limited ? "rate_limited" : "unavailable" };
    },
  };
}
