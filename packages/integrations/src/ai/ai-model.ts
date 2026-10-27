// The AI port (ADR 0029): one completion from a list of chat messages, in plain text or as a JSON object, from the
// first of the configured models that answers. Adapters: any OpenAI-compatible chat endpoint (OpenRouter, Google's
// Gemini, Groq...) and the in-memory one tests script. Domain code never sees a vendor's SDK or URL.

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiRequest {
  /** Which list of models answers: "chat" for the agent and suggestions, "fast" for scoring and extraction. */
  tier: "chat" | "fast";
  messages: readonly AiMessage[];
  /** Ask for a JSON object; the caller still validates it. */
  json?: boolean;
  maxTokens?: number;
  /** An opaque id for the provider's per-user tracking: the organization's id, never personal data. */
  user?: string;
}

export type AiResult =
  | {
      ok: true;
      text: string;
      /** The model that actually answered. */
      model: string;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      ok: false;
      /** rate_limited (try later), unavailable (no model answered), not_configured, refused. */
      reason: "rate_limited" | "unavailable" | "not_configured" | "refused";
    };

export interface AiModel {
  /** Whether a key and models are set: off, the AI features say so instead of failing. */
  readonly configured: boolean;
  /** The models of each tier, in the order they are tried, for the settings screen. */
  readonly models: { chat: readonly string[]; fast: readonly string[] };
  complete(request: AiRequest): Promise<AiResult>;
}
