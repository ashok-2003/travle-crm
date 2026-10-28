// The AI port (ADR 0029): one text completion from a list of chat messages, for one named feature, from the first of that
// feature's configured models that answers. Adapters: OpenRouter, with its zero-data-retention routing on every request, and
// the in-memory one tests script. Domain code never sees a vendor's SDK or URL.

/** The features that call the model; each has its own list of models in the settings. */
export const aiFeatures = ["suggest_reply"] as const;
export type AiFeature = (typeof aiFeatures)[number];

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiRequest {
  feature: AiFeature;
  messages: readonly AiMessage[];
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
