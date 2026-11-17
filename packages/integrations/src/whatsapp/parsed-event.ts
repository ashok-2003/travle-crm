// What the webhook parser makes of one MSG91 event (ADR 0035): the domain never sees MSG91's field names.

export const whatsAppMessageKinds = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "contacts",
  "reaction",
  "unsupported",
] as const;
export type WhatsAppMessageKind = (typeof whatsAppMessageKinds)[number];

export const whatsAppStatuses = ["sent", "delivered", "read", "failed"] as const;
export type WhatsAppStatus = (typeof whatsAppStatuses)[number];

/**
 * What the customer tapped, kept as one value so the id and its kind cannot disagree: both set or both null. The id is
 * exactly what WhatsApp returned (1 to 256 characters); only `"button"` is one of our reply buttons, so a handler that acts
 * on a tap must require `replyKind === "button"` and its own id format. A list row is `"list"`; a template's quick reply
 * is `"quick_reply"` and its id is text from the template's setup, never ours.
 */
export type ParsedReply =
  { buttonReplyId: string; replyKind: "button" | "list" | "quick_reply" } | { buttonReplyId: null; replyKind: null };

/** A message the customer sent us, or (an echo) one the agency sent from the phone. */
export type ParsedMessage = ParsedMessageFields & ParsedReply;

interface ParsedMessageFields {
  /** WhatsApp's message id. */
  wamid: string;
  /** Our number, digits as MSG91 writes it: routes the event to an agency. */
  integratedNumber: string;
  /** The customer's number as "+<digits>", +91 added only for ten digits. */
  customerNumber: string;
  /** The customer's WhatsApp profile name. */
  customerName: string | null;
  occurredAt: Date | null;
  kind: WhatsAppMessageKind;
  text: string | null;
  caption: string | null;
  fileName: string | null;
  mediaUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  quotedWamid: string | null;
  /** For a reaction: the emoji and the message it is on. */
  reaction: { emoji: string; targetWamid: string | null } | null;
  /** The click-to-WhatsApp ad this message came from, when the webhook carried one with a source id or a headline. */
  referral: { sourceId: string | null; headline: string | null; sourceUrl: string | null } | null;
  /** MSG91's name for a content type we don't read (kind "unsupported"), so it can be logged and added; else absent. */
  unknownType?: string;
}

export type ParsedEvent =
  | ({ type: "inbound" } & ParsedMessage)
  | ({ type: "echo" } & ParsedMessage)
  | {
      type: "status";
      wamid: string;
      integratedNumber: string;
      status: WhatsAppStatus;
      /** MSG91's or Meta's code for a failure. */
      reasonCode: string | null;
      occurredAt: Date | null;
    }
  /** Kept and counted, nothing more. `integratedNumber` is set when the event named one, so it can still be routed. */
  | { type: "unknown"; integratedNumber: string | null };
