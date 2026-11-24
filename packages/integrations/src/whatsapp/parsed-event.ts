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
  /** For kind "unsupported": WhatsApp's own reason it could not pass the message on; else absent. */
  unsupportedReason?: UnsupportedReason;
}

/** `unavailable`: WhatsApp could not read it (error 131060); `album`: a set of photos sent together; else `unknown`. */
export type UnsupportedReason = "unavailable" | "album" | "unknown";

export type ParsedEvent =
  | ({ type: "inbound" } & ParsedMessage)
  /**
   * `requestId`: MSG91's id of the send request. `ourSend`: the echo of a message our api sent, which MSG91 writes with no
   * `contentType` (the phone app's always has one: 76 of 76 live, 2026-11-22).
   */
  | ({ type: "echo"; requestId: string | null; ourSend: boolean } & ParsedMessage)
  | {
      type: "status";
      wamid: string;
      integratedNumber: string;
      /** The customer's number as "+<digits>", when the event named one. */
      customerNumber: string | null;
      /** MSG91's id of the send request, which finds a send whose answer gave no wamid. */
      requestId: string | null;
      status: WhatsAppStatus;
      /** MSG91's or Meta's code for a failure. */
      reasonCode: string | null;
      occurredAt: Date | null;
    }
  /**
   * An edit or a deletion of a message already stored, by the customer or (`fromPhone`) from the agency's phone: it lands on
   * that message and is no message of its own. `text` is the edit's new words.
   */
  | {
      type: "change";
      kind: "edit" | "revoke";
      fromPhone: boolean;
      originalWamid: string;
      text: string | null;
      wamid: string;
      integratedNumber: string;
      customerNumber: string;
      customerName: string | null;
      occurredAt: Date | null;
    }
  /** An edit or a deletion that names no original (or an edit with no words): routed, then dropped. */
  | { type: "ignored"; integratedNumber: string }
  /** Kept and counted, nothing more. `integratedNumber` is set when the event named one, so it can still be routed. */
  | { type: "unknown"; integratedNumber: string | null };
