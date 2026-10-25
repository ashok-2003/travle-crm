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

/** A message the customer sent us, or (an echo) one the agency sent from the phone. */
export interface ParsedMessage {
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
