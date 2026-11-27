// The AI adapter (ADR 0029): any OpenAI-compatible chat endpoint, OpenRouter's by default (Google's Gemini, called directly,
// is https://generativelanguage.googleapis.com/v1beta/openai). Each feature's models are configuration: its list is tried in
// order, the next one when a model is rate limited, overloaded or gone, and a rate-limited one rests a while unasked; a
// request that names its own model asks that one alone.
// OpenRouter's own fields (`provider.zdr`, zero data retention on every request) are sent ONLY to OpenRouter: other
// endpoints reject fields they don't know, and keep what their own terms say. Tools go as OpenAI-style functions; reasoning
// is `reasoning` and `reasoning_details` on OpenRouter, `reasoning_effort` elsewhere (Gemini), and a tool call's extra data
// (Gemini's thought signature) goes back unchanged. The agent's turns on an OpenAI reasoning model go by the Responses API,
// which also returns the model's reasoning summary (responses.ts). On Vertex AI, a service account's token takes the key's
// place, a recording's format goes as its MIME type, and a big system message and its tools go once, as a context cache
// the requests name (vertex-cache.ts). The key or token is sent as a header and appears nowhere else: not in a message, a
// log or an error.
import {
  NEXT_MODEL_MIN_LEFT_MS,
  type AiAudioFormat,
  type AiEffort,
  type AiFeature,
  type AiFinishReason,
  type AiMessage,
  type AiModel,
  type AiRequest,
  type AiResult,
} from "./ai-model.js";
import { readResponses, responsesBody, usesResponses, type ResponsesReply } from "./responses.js";
import { createVertexCache } from "./vertex-cache.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterOptions {
  /** The endpoint's key, or what gives a current OAuth token for each request (a service account's, on Vertex AI). */
  apiKey: string | (() => Promise<string>);
  /** Each feature's models, the preferred one first, then its fallbacks. */
  models: Readonly<Partial<Record<AiFeature, readonly string[]>>>;
  /** The endpoint's address (OpenRouter's by default); any OpenAI-compatible one is accepted. */
  baseUrl?: string;
  /** OpenRouter only: false turns its zero-data-retention routing off (its free models need it). */
  zeroRetention?: boolean;
  /** Milliseconds before one model's try is given up, unless the request sets its own. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Told of each 429 the endpoint answers (not of a model skipped while it rests), so the rate of them can be watched. */
  onRateLimited?: (event: { model: string; feature: AiFeature; restMs: number }) => void;
  /**
   * An OpenAI reasoning model (gpt-5 and later; on Azure AI Foundry, 2026-11-24): it refuses `max_tokens` and any
   * temperature but its default, so it gets `max_completion_tokens` (its thinking counts, so never less than this room)
   * and no temperature, this one effort on every call whatever the request asks, and a prompt cache key of the feature
   * and the request's user (an organization's id), so a repeated prompt start is read from its cache.
   */
  reasoningModel?: { effort: AiEffort; maxCompletionTokens: number };
}

interface ChatCompletion {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: ({ id?: string; type?: string; function?: { name?: string; arguments?: string } } & Record<
        string,
        unknown
      >)[];
      reasoning_details?: unknown;
    };
    finish_reason?: string;
  }[];
}

/** Statuses after which the next model is tried. */
const TRY_NEXT = new Set([404, 408, 409, 429, 500, 502, 503, 504, 529]);

/**
 * How long a model that said 429 is left alone: the provider's Retry-After when it gives one, within these bounds, else a
 * minute. Meanwhile the model is skipped without a request, so a call goes straight to the next model (or the backup key)
 * instead of waiting for the same refusal again.
 */
const REST_DEFAULT_MS = 60_000;
const REST_MAX_MS = 15 * 60_000;

function restOf(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, REST_MAX_MS) : REST_DEFAULT_MS;
}

/** Each audio format's MIME type, as Vertex AI takes it in `input_audio.format` (a short "ogg" is a 400 there). */
const audioMimeTypes: Record<AiAudioFormat, string> = {
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  m4a: "audio/mp4",
};

/**
 * How the endpoint reads `input_audio.format`: the short form ("ogg", OpenRouter's), a MIME type (Vertex AI's), or only
 * "wav" or "mp3" (Google AI Studio's, which reads the recording's own format from its bytes: an OGG voice note
 * labelled mp3 is heard, and labelled ogg is a 400, tried 2026-11-27).
 */
export type AudioLabels = "short" | "mime" | "wav_or_mp3";

function audioLabel(format: AiAudioFormat, labels: AudioLabels): string {
  if (labels === "mime") return audioMimeTypes[format];
  if (labels === "wav_or_mp3") return format === "wav" ? "wav" : "mp3";
  return format;
}

/** The parts of a message's content: words alone stay a string; with an image or a recording they become parts. */
function contentOf(message: AiMessage, labels: AudioLabels): unknown {
  if (message.attachments === undefined || message.attachments.length === 0) return message.content;
  const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
  return [
    { type: "text", text: message.content },
    ...message.attachments.map((part) =>
      part.type === "image"
        ? { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${base64(part.bytes)}` } }
        : { type: "input_audio", input_audio: { data: base64(part.bytes), format: audioLabel(part.format, labels) } },
    ),
  ];
}

/** A message as the endpoint takes it. */
interface WireMessage {
  role: AiMessage["role"];
  content: unknown;
  tool_calls?: ({ id: string; type: "function"; function: { name: string; arguments: string } } & Record<
    string,
    unknown
  >)[];
  reasoning_details?: unknown;
  tool_call_id?: string;
}

/**
 * A message as the endpoint takes it: its content, an assistant's tool calls and reasoning sent back as the model gave
 * them, and a tool result named by its call's id.
 */
export function wireMessage(message: AiMessage, labels: AudioLabels = "short"): WireMessage {
  const toolCalls = message.toolCalls ?? [];
  return {
    role: message.role,
    content: contentOf(message, labels),
    ...(toolCalls.length === 0
      ? {}
      : {
          tool_calls: toolCalls.map((call) => ({
            // The provider's own data first, so it can never overwrite the call's id, type or function.
            ...call.providerData,
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        }),
    ...(message.reasoningDetails === undefined ? {} : { reasoning_details: message.reasoningDetails }),
    ...(message.toolCallId === undefined ? {} : { tool_call_id: message.toolCallId }),
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

/** Whether the base URL is Google AI Studio's OpenAI-compatible endpoint (https, host generativelanguage.googleapis.com). */
function isAiStudioUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && url.hostname === "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
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

/** The response_format sent: a schema request implies JSON, as json_schema (strict off) or, on the retry, a plain json_object. */
function responseFormat(request: AiRequest, asJson: boolean): object {
  if (request.schema !== undefined && !asJson) {
    const { name, jsonSchema } = request.schema;
    return { response_format: { type: "json_schema", json_schema: { name, strict: false, schema: jsonSchema } } };
  }
  return request.json === true || request.schema !== undefined ? { response_format: { type: "json_object" } } : {};
}

/** The reasoning effort in the endpoint's own form: OpenRouter's `reasoning`, Gemini's (and OpenAI's) `reasoning_effort`. */
function reasoningSetting(request: AiRequest, openRouter: boolean): object {
  if (request.reasoning === undefined) return {};
  return openRouter
    ? { reasoning: { effort: request.reasoning.effort } }
    : { reasoning_effort: request.reasoning.effort };
}

type ReasoningModel = NonNullable<OpenRouterOptions["reasoningModel"]>;

/** A reasoning model's room to think and answer: the request's, never less than its own. */
const roomOf = (request: AiRequest, reasoningModel: ReasoningModel): number =>
  Math.max(request.maxTokens ?? 500, reasoningModel.maxCompletionTokens);

/** A reasoning model's prompt cache key: the feature and the request's user (an organization's id). */
const cacheKeyOf = (request: AiRequest): string => `${request.feature}:${request.user ?? "none"}`;

/** The answer's length, temperature and effort: as the request asks, or a reasoning model's own (its option's comment). */
function lengthAndEffort(
  request: AiRequest,
  openRouter: boolean,
  reasoningModel: OpenRouterOptions["reasoningModel"],
): object {
  if (reasoningModel === undefined) {
    return {
      max_tokens: request.maxTokens ?? 500,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...reasoningSetting(request, openRouter),
    };
  }
  return {
    max_completion_tokens: roomOf(request, reasoningModel),
    reasoning_effort: reasoningModel.effort,
    prompt_cache_key: cacheKeyOf(request),
  };
}

const hasTools = (request: AiRequest): boolean => (request.tools ?? []).length > 0;

/**
 * The tools as functions, and the tool choice, only on a request with tools. Never `parallel_tool_calls`: no Gemini endpoint
 * OpenRouter lists takes it, so under `require_parameters` it would leave no route (Gemini calls in parallel by itself).
 */
function toolSettings(request: AiRequest): object {
  if (!hasTools(request)) return {};
  return {
    tools: (request.tools ?? []).map(({ name, description, parameters }) => ({
      type: "function",
      function: { name, description, parameters },
    })),
    ...(request.toolChoice === undefined ? {} : { tool_choice: request.toolChoice }),
  };
}

/** The messages with the schema said in words in the system message (added first when there is none). */
function withSchemaInSystem(request: AiRequest): readonly AiMessage[] {
  if (request.schema === undefined) return request.messages;
  const line = `Answer as JSON matching: ${JSON.stringify(request.schema.jsonSchema)}`;
  const [first, ...rest] = request.messages;
  return first?.role === "system"
    ? [{ ...first, content: `${first.content}\n\n${line}` }, ...rest]
    : [{ role: "system", content: line }, ...request.messages];
}

/**
 * Whether a schema request is asked again in json mode: any 400 or 404. Endpoints word a refused json_schema their own
 * way (OpenRouter's "no endpoints", Gemini's INVALID_ARGUMENT about a schema keyword), or not readably at all; the retry
 * costs one call.
 */
const refusesSchema = (response: Response): boolean => response.status === 400 || response.status === 404;

/**
 * Whether Gemini's OpenAI endpoint refused a well-formed request as an invalid payload ("Invalid JSON payload received.
 * Unknown name "": Root element must be a message."), which it now and then does: the same request sent again goes
 * through (a replay of 35 live agent turns, 2026-11-25: 13 hit it). The body is read here and never kept.
 */
const saysInvalidPayload = async (response: Response): Promise<boolean> =>
  response.status === 400 &&
  /Invalid JSON payload received|Root element must be a message/.test(await response.clone().text());

const finishReasonOf = (reason: string | undefined): AiFinishReason =>
  reason === "stop" || reason === "tool_calls" || reason === "length" || reason === "content_filter" ? reason : "other";

/**
 * The completion's answer, or null when it holds neither words nor tool calls (the next model is asked). To a request with
 * tools, nothing said, with a stop or no reason, is an empty answer: the agent's loop nudges once or ends quiet, where
 * asking another model would fail the turn and drop what its tool rounds staged. `model` is the name the answer goes
 * back under: the agent asks that name for its next tool round.
 */
function answerOf(
  body: ChatCompletion,
  model: string,
  ms: number,
  withTools: boolean,
): Extract<AiResult, { ok: true }> | null {
  const choice = body.choices?.[0];
  const said = choice?.message?.content ?? "";
  const toolCalls = (choice?.message?.tool_calls ?? []).map((call) => {
    // Everything but the id, the type and the function is the provider's own (Gemini's thought signature).
    const { id, function: fn, ...rest } = call;
    const providerData = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "type"));
    return {
      id: id ?? "",
      name: fn?.name ?? "",
      arguments: fn?.arguments ?? "",
      ...(Object.keys(providerData).length === 0 ? {} : { providerData }),
    };
  });
  const silent = said.trim() === "" && toolCalls.length === 0;
  const stopped = choice?.finish_reason === undefined || choice.finish_reason === "stop";
  if (silent && !(withTools && stopped)) return null;
  const text = silent ? "" : said;
  const reasoningDetails = choice?.message?.reasoning_details;
  return {
    ok: true,
    text,
    model,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    toolCalls,
    finishReason: finishReasonOf(choice?.finish_reason),
    cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    ms,
    ...(reasoningDetails === undefined || reasoningDetails === null ? {} : { reasoningDetails }),
  };
}

export function createOpenRouterModel(options: OpenRouterOptions): AiModel {
  const base = aiBaseUrl(options.baseUrl);
  const openRouter = isOpenRouterUrl(base);
  // A token in place of a key is Vertex AI's service account: Vertex reads input_audio's format as a MIME type, and caches.
  const vertex = typeof options.apiKey !== "string";
  const labels: AudioLabels = vertex ? "mime" : isAiStudioUrl(base) ? "wav_or_mp3" : "short";
  const send = options.fetch ?? fetch;
  const cacheOf = vertex ? createVertexCache(base, send) : null;
  /** Each rate-limited model, with the time it may be asked again. Per process, so it is forgotten on a restart. */
  const restingUntil = new Map<string, number>();
  return {
    configured: options.apiKey !== "" && Object.values(options.models).some((list) => list.length > 0),
    serves: (model) => Object.values(options.models).some((list) => list.includes(model)),
    async complete(request: AiRequest): Promise<AiResult> {
      const list = request.model === undefined ? (options.models[request.feature] ?? []) : [request.model];
      if (options.apiKey === "" || list.length === 0) return { ok: false, reason: "not_configured" };
      // A service account's token, asked for once per call: none to be had fails every model alike (its module logs why).
      let bearer: string;
      try {
        bearer = typeof options.apiKey === "string" ? options.apiKey : await options.apiKey();
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      // The agent's turn on a reasoning model goes by the Responses API, with the reasoning model's own settings.
      const reasoningModel = options.reasoningModel;
      const responses =
        reasoningModel !== undefined && usesResponses(request)
          ? {
              effort: reasoningModel.effort,
              maxOutputTokens: roomOf(request, reasoningModel),
              promptCacheKey: cacheKeyOf(request),
            }
          : null;
      let limited = false;
      let tried = false;
      for (const model of list) {
        if ((restingUntil.get(model) ?? 0) > Date.now()) {
          limited = true;
          continue;
        }
        // No try once the deadline is gone, and another model only while 20 seconds of it remain.
        const left = request.deadlineAt === undefined ? Infinity : request.deadlineAt - Date.now();
        if (left <= 0 || (tried && left < NEXT_MODEL_MIN_LEFT_MS)) break;
        tried = true;
        const started = Date.now();
        const limit = Math.min(request.timeoutMs ?? options.timeoutMs ?? 30_000, left);
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, limit);
        try {
          const postTo = (path: string, body: object) =>
            send(`${base}${path}`, {
              method: "POST",
              signal: controller.signal,
              headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
              body: JSON.stringify(body),
            });
          // A request naming a cache sends neither the system message nor the tools: Vertex refuses them beside one.
          const post = (asJson: boolean, cache: string | null) =>
            postTo("/chat/completions", {
              model,
              messages: (asJson ? withSchemaInSystem(request) : request.messages)
                .slice(cache === null ? 0 : 1)
                .map((message) => wireMessage(message, labels)),
              ...lengthAndEffort(request, openRouter, options.reasoningModel),
              ...responseFormat(request, asJson),
              ...(cache === null ? toolSettings(request) : { extra_body: { google: { cached_content: cache } } }),
              ...(request.user === undefined ? {} : { user: request.user }),
              // OpenRouter only: zero data retention on every request, and only providers that honour all the parameters sent.
              ...(openRouter && options.zeroRetention !== false
                ? { provider: { zdr: true, require_parameters: true } }
                : {}),
            });
          // A Responses request has no schema and no Vertex cache, so neither retry below is ever its.
          const cached =
            cacheOf === null || responses !== null ? null : await cacheOf(request, model, bearer, controller.signal);
          // The last request sent, for Gemini's invalid-payload refusal below.
          let sendAgain = () =>
            responses === null
              ? post(false, cached?.name ?? null)
              : postTo("/responses", responsesBody(request, model, responses));
          let response = await sendAgain();
          // Vertex refused the cache (it ended early, say): forgotten, and the same model asked once more without it.
          if (cached !== null && (response.status === 400 || response.status === 404)) {
            cached.forget();
            sendAgain = () => post(false, null);
            response = await sendAgain();
          }
          // The endpoint refused json_schema: the same model once more in json mode, the schema said in words.
          if (request.schema !== undefined && refusesSchema(response)) {
            sendAgain = () => post(true, null);
            response = await sendAgain();
          }
          // Gemini refused a well-formed request as an invalid payload: once more, then the next model, never a final
          // bad_request (the owner's replay, 2026-11-25), so the backup keys and the reasoning model behind them may answer.
          if (await saysInvalidPayload(response)) {
            response = await sendAgain();
            if (await saysInvalidPayload(response)) continue;
          }
          if (!response.ok) {
            if (response.status === 429) {
              limited = true;
              const restMs = restOf(response);
              restingUntil.set(model, Date.now() + restMs);
              options.onRateLimited?.({ model, feature: request.feature, restMs });
            }
            if (TRY_NEXT.has(response.status)) continue;
            // A 400 to a request with tools is the request's fault (a tool round without its thought signatures, say):
            // another model would refuse it too.
            return { ok: false, reason: response.status === 400 && hasTools(request) ? "bad_request" : "unavailable" };
          }
          const reply: unknown = await response.json();
          const { completion: body, reasoningSummary }: { completion: ChatCompletion; reasoningSummary: string } =
            responses === null
              ? { completion: reply as ChatCompletion, reasoningSummary: "" }
              : readResponses(reply as ResponsesReply);
          if (body.choices?.[0]?.finish_reason === "content_filter") return { ok: false, reason: "refused" };
          // Off OpenRouter, the answer goes back under the name asked: Azure answers with the model's dated name, which
          // isn't a deployment it takes back, so a tool round named that way would fail.
          const named = openRouter ? (body.model ?? model) : model;
          const answer = answerOf(body, named, Date.now() - started, hasTools(request));
          if (answer === null) continue;
          restingUntil.delete(model);
          return reasoningSummary === "" ? answer : { ...answer, reasoningSummary };
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
