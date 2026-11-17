// The AI port (ADR 0029): one completion (words, tool calls or both) from a list of chat messages, for one named feature, from
// the first of that feature's configured models that answers. Adapters: OpenRouter, with its zero-data-retention routing on
// every request, and the in-memory one tests script. Domain code never sees a vendor's SDK or URL.

/** The features that call the model; each has its own list of models in the settings. */
export const aiFeatures = [
  "suggest_reply",
  "score_lead",
  "autopilot",
  "fill_form",
  "write_up",
  "ask_report",
  "read_requests",
  "reach_out",
  "draft_days",
  "read_rates",
  "draft_packages",
  "sales_agent",
] as const;
export type AiFeature = (typeof aiFeatures)[number];

/**
 * Something besides words that a user message carries. Gemini's OpenAI-compatible endpoint takes only WAV and MP3 audio
 * (checked 2026-10-30: webm, ogg and mp4 are refused), so the browser encodes WAV itself.
 */
export type AiPart =
  | { type: "image"; mimeType: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array }
  | { type: "audio"; format: "wav" | "mp3"; bytes: Uint8Array };

/** A function the model may call: its name, what it is for, and a JSON Schema of its arguments. */
export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A call the model made: `arguments` is the raw JSON text it sent, which the caller parses and checks. */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Why the model stopped; any reason the provider gives besides these four is "other". The OpenRouter adapter answers a
 * `content_filter` stop as the failure `refused` instead, so only other adapters' answers carry it.
 */
export type AiFinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "other";

/** How much the model thinks before it answers. */
export type AiEffort = "minimal" | "low" | "medium";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Images and recordings the words go with; only a user message has them, and only a multimodal model reads them. */
  attachments?: readonly AiPart[];
  /** An assistant message's tool calls, sent back as the model made them. */
  toolCalls?: readonly AiToolCall[];
  /** A tool message: the id of the call whose result it holds. */
  toolCallId?: string;
  /**
   * An assistant message's reasoning as the provider gave it, sent back unchanged: Gemini refuses a tool round without
   * its thought signatures (400). Opaque to everything but the adapter.
   */
  reasoningDetails?: unknown;
}

export interface AiRequest {
  feature: AiFeature;
  messages: readonly AiMessage[];
  /** Ask for a JSON object; the caller still validates it. */
  json?: boolean;
  /**
   * Ask for an answer that fits this JSON Schema (implies JSON). The caller builds `jsonSchema` with `z.toJSONSchema(contract)`,
   * using no transforms, and still validates the answer.
   */
  schema?: { name: string; jsonSchema: Record<string, unknown> };
  maxTokens?: number;
  /** An opaque id for the provider's per-user tracking: the organization's id, never personal data. */
  user?: string;
  /** Only this model, instead of the feature's list (on a backup key too): Try it's test chat alone names one. */
  model?: string;
  /**
   * The sampling temperature, sent only when set: left out, the model keeps its own default, as Google advises for our
   * Gemini model. Try it's test chat alone sets one.
   */
  temperature?: number;
  /** Functions the model may call; with none, no tool setting is sent. */
  tools?: readonly AiTool[];
  /** Whether the model may call the tools ("auto") or must answer in words ("none"); sent only with tools. */
  toolChoice?: "auto" | "none";
  /**
   * How much the model thinks, sent as OpenRouter's `reasoning.effort`: for requests to OpenRouter alone (Google's
   * endpoint names it otherwise).
   */
  reasoning?: { effort: AiEffort };
  /** How long one model's try may take, in milliseconds, instead of the adapter's own limit. */
  timeoutMs?: number;
  /**
   * When the whole call must have ended, in epoch milliseconds: no try runs past it, and another model (or the backup) is
   * asked only while `NEXT_MODEL_MIN_LEFT_MS` of it remain.
   */
  deadlineAt?: number;
}

/**
 * Another model, or the backup, is asked only while this much of a request's deadline remains (the owner, 2026-11-15:
 * 20 seconds, with the natural agent's 2-minute turn and 60-second tries).
 */
export const NEXT_MODEL_MIN_LEFT_MS = 20_000;

export type AiResult =
  | {
      ok: true;
      text: string;
      /** The model that actually answered. */
      model: string;
      /** The tokens the provider counted, 0 when it said nothing. */
      inputTokens: number;
      outputTokens: number;
      /** The calls the model made, in its order; an answer may hold calls and no words. */
      toolCalls?: AiToolCall[];
      finishReason?: AiFinishReason;
      /** Of the input tokens, those the provider read from its cache. */
      cachedTokens?: number;
      /** Of the output tokens, those spent thinking. */
      reasoningTokens?: number;
      /** How long the try that answered took. */
      ms?: number;
      /** The reasoning to send back unchanged with this answer's tool calls (`AiMessage.reasoningDetails`). */
      reasoningDetails?: unknown;
    }
  | {
      /**
       * rate_limited (try later), unavailable (no model answered), not_configured, refused (the provider declined to
       * answer), bad_request (the endpoint refused a request with tools, such as one missing its thought signatures).
       */
      ok: false;
      reason: "rate_limited" | "unavailable" | "not_configured" | "refused" | "bad_request";
    };

/** Why a call gave no answer. */
export type AiFailure = Extract<AiResult, { ok: false }>["reason"];

export interface AiModel {
  /** Whether a key and a model are set: off, the AI features say so instead of failing. */
  readonly configured: boolean;
  complete(request: AiRequest): Promise<AiResult>;
}
