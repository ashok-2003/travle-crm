// The WhatsAppProvider port (ADR 0035): the only code that calls MSG91's WhatsApp API. Methods return a value and never
// throw on a provider's answer; a failure carries MSG91's and Meta's codes and nothing else (never a body, a URL or the key).

/** The webhook header MSG91's panel is set to send (a constant: the value is a secret in the settings). */
export const WHATSAPP_WEBHOOK_HEADER = "x-travel-crm-key";

export const whatsAppFailureReasons = [
  "window_closed",
  "not_on_whatsapp",
  "bad_number",
  "template_not_approved",
  "rate_limited",
  "tier_limit",
  "provider_down",
  /** A timeout or a dropped connection after the request left: the message may or may not have gone. */
  "unsure",
  "other",
] as const;
export type WhatsAppFailureReason = (typeof whatsAppFailureReasons)[number];

/** Reasons that never reached WhatsApp, so a send may be tried again by itself. */
export const retryableFailureReasons: readonly WhatsAppFailureReason[] = ["provider_down", "rate_limited"];

export type WhatsAppSendResult =
  | { ok: true; wamid: string | null; requestId: string | null }
  | { ok: false; reason: WhatsAppFailureReason; providerCode?: string; metaCode?: string };

export type WhatsAppMediaKind = "image" | "video" | "audio" | "document";

export interface WhatsAppMediaToSend {
  kind: WhatsAppMediaKind;
  /** A short-lived download link the provider fetches the file from. SPIKE(S4): or the bytes are uploaded. */
  url: string;
  caption?: string;
  fileName?: string;
}

export interface WhatsAppTemplateSend {
  name: string;
  language: string;
  /** The values for {{1}}, {{2}}... in order. */
  parameters: readonly string[];
}

export const whatsAppTemplateStatuses = ["pending", "approved", "rejected", "paused", "disabled"] as const;
export type WhatsAppTemplateStatus = (typeof whatsAppTemplateStatuses)[number];

export interface WhatsAppTemplateSummary {
  name: string;
  language: string;
  category: "utility" | "marketing" | "authentication";
  /** The body with {{1}} markers. */
  body: string;
  footer: string | null;
  status: WhatsAppTemplateStatus;
  /** Meta's rejection text. */
  reason: string | null;
  providerRef: string | null;
}

export interface WhatsAppTemplateDraft {
  name: string;
  language: string;
  category: "utility" | "marketing";
  body: string;
  footer: string | null;
  /** One sample value per marker, which Meta needs. */
  samples: readonly string[];
}

export interface WhatsAppNumberInfo {
  /** Meta's quality rating as MSG91 gives it: green, yellow or red (SPIKE(S8)). */
  qualityRating: string | null;
  status: string | null;
}

export type WhatsAppListResult =
  { ok: true; templates: readonly WhatsAppTemplateSummary[] } | { ok: false; reason: WhatsAppFailureReason };

export type WhatsAppCreateResult =
  { ok: true; providerRef: string | null } | { ok: false; reason: WhatsAppFailureReason; providerCode?: string };

export type WhatsAppNumberResult =
  { ok: true; info: WhatsAppNumberInfo } | { ok: false; reason: WhatsAppFailureReason };

export type WhatsAppMediaResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: "expired" | "too_big" | "bad_type" | "unavailable" };

export interface WhatsAppProvider {
  /** `number` is the agency's integrated number, as MSG91 writes it (digits); `to` is E.164 or digits. */
  sendText(number: string, to: string, text: string): Promise<WhatsAppSendResult>;
  sendMedia(number: string, to: string, media: WhatsAppMediaToSend): Promise<WhatsAppSendResult>;
  sendTemplate(number: string, to: string, template: WhatsAppTemplateSend): Promise<WhatsAppSendResult>;
  listTemplates(number: string): Promise<WhatsAppListResult>;
  createTemplate(number: string, template: WhatsAppTemplateDraft): Promise<WhatsAppCreateResult>;
  /** SPIKE(S8). */
  fetchNumber(number: string): Promise<WhatsAppNumberResult>;
  /** Downloads an inbound file; a type outside the allowlist or a file over `maxBytes` is refused. SPIKE(S7). */
  downloadMedia(
    url: string,
    options: { maxBytes: number; allowedTypes: readonly string[] },
  ): Promise<WhatsAppMediaResult>;
}

/** A failure the port was given as a value: only codes. */
export const failed = (reason: WhatsAppFailureReason, codes: { providerCode?: string; metaCode?: string } = {}) =>
  ({ ok: false, reason, ...codes }) as const;
