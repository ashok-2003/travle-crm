// The AI port (ADR 0029): one text completion from a list of chat messages, for one named feature, from the first of that
// feature's configured models that answers. Adapters: OpenRouter, with its zero-data-retention routing on every request, and
// the in-memory one tests script. Domain code never sees a vendor's SDK or URL.

/** The features that call the model; each has its own list of models in the settings. */
export const aiFeatures = ["suggest_reply", "score_lead", "autopilot", "learn", "fill_form"] as const;
export type AiFeature = (typeof aiFeatures)[number];

/**
 * Something besides words that a user message carries. Gemini's OpenAI-compatible endpoint takes only WAV and MP3 audio
 * (checked 2026-10-30: webm, ogg and mp4 are refused), so the browser encodes WAV itself.
 */
export type AiPart =
  | { type: "image"; mimeType: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array }
  | { type: "audio"; format: "wav" | "mp3"; bytes: Uint8Array };

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Images and recordings the words go with; only a user message has them, and only a multimodal model reads them. */
  attachments?: readonly AiPart[];
}

export interface AiRequest {
  feature: AiFeature;
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
      /** The tokens the provider counted, 0 when it said nothing. */
      inputTokens: number;
      outputTokens: number;
    }
  | {
      /** rate_limited (try later), unavailable (no model answered), not_configured, refused (the provider declined to answer). */
      ok: false;
      reason: "rate_limited" | "unavailable" | "not_configured" | "refused";
    };

export interface AiModel {
  /** Whether a key and a model are set: off, the AI features say so instead of failing. */
  readonly configured: boolean;
  complete(request: AiRequest): Promise<AiResult>;
}
