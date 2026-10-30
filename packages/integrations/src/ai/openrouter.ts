// The AI adapter (ADR 0029): any OpenAI-compatible chat endpoint, OpenRouter's by default (Google's Gemini, called directly,
// is https://generativelanguage.googleapis.com/v1beta/openai). Each feature's models are configuration: its list is tried in
// order, the next one when a model is rate limited, overloaded or gone. OpenRouter's own fields (`provider.zdr`, zero data
// retention on every request) are sent ONLY to OpenRouter: other endpoints reject fields they don't know, and keep what
// their own terms say. The key is sent as a header and appears nowhere else: not in a message, a log or an error.
import type { AiMessage, AiModel, AiRequest, AiResult, AiFeature } from "./ai-model.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterOptions {
  apiKey: string;
  /** Each feature's models, the preferred one first, then its fallbacks. */
  models: Readonly<Partial<Record<AiFeature, readonly string[]>>>;
  /** The endpoint's address (OpenRouter's by default); any OpenAI-compatible one is accepted. */
  baseUrl?: string;
  /** OpenRouter only: false turns its zero-data-retention routing off (its free models need it). */
  zeroRetention?: boolean;
  /** Milliseconds before one model's try is given up. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ChatCompletion {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/** Statuses after which the next model is tried. */
const TRY_NEXT = new Set([404, 408, 409, 429, 500, 502, 503, 504, 529]);

/** A message as the endpoint takes it: words alone stay a string; a message with an image or a recording becomes parts. */
export function wireMessage(message: AiMessage): { role: AiMessage["role"]; content: unknown } {
  if (message.attachments === undefined || message.attachments.length === 0) {
    return { role: message.role, content: message.content };
  }
  const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
  return {
    role: message.role,
    content: [
      { type: "text", text: message.content },
      ...message.attachments.map((part) =>
        part.type === "image"
          ? { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${base64(part.bytes)}` } }
          : { type: "input_audio", input_audio: { data: base64(part.bytes), format: part.format } },
      ),
    ],
  };
}

/** The base URL as the adapter calls it: an http(s) address with no credentials in it, without a trailing slash. */
export function aiBaseUrl(baseUrl: string = OPENROUTER_BASE_URL): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("The AI base URL is not a URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "") {
    throw new Error("The AI base URL must be an http(s) address with no credentials");
  }
  return baseUrl.replace(/\/+$/, "");
}

/** Whether the base URL is OpenRouter's (https, host openrouter.ai): the only one that takes its `provider` routing field. */
export function isOpenRouterUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && url.hostname === "openrouter.ai";
  } catch {
    return false;
  }
}

export function createOpenRouterModel(options: OpenRouterOptions): AiModel {
  const base = aiBaseUrl(options.baseUrl);
  const openRouter = isOpenRouterUrl(base);
  const send = options.fetch ?? fetch;
  return {
    configured: options.apiKey !== "" && Object.values(options.models).some((list) => list.length > 0),
    async complete(request: AiRequest): Promise<AiResult> {
      const list = options.models[request.feature] ?? [];
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
              messages: request.messages.map(wireMessage),
              max_tokens: request.maxTokens ?? 500,
              ...(request.json === true ? { response_format: { type: "json_object" } } : {}),
              ...(request.user === undefined ? {} : { user: request.user }),
              // OpenRouter only: zero data retention on every request, and only providers that honour all the parameters sent.
              ...(openRouter && options.zeroRetention !== false
                ? { provider: { zdr: true, require_parameters: true } }
                : {}),
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
          return {
            ok: true,
            text,
            model: body.model ?? model,
            inputTokens: body.usage?.prompt_tokens ?? 0,
            outputTokens: body.usage?.completion_tokens ?? 0,
          };
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
