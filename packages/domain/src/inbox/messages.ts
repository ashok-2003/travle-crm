// Turning a parsed message into the columns of a message row, and the small texts around it (spec 4.3 I4, I7).
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";

/** WhatsApp's own ceiling for text. */
export const MAX_BODY = 4096;
const CUT_MARKER = "…";

/** Text as received, cut with a marker at WhatsApp's ceiling, never an error (I7). */
export function boundedText(text: string | null): string | null {
  if (text === null) return null;
  return text.length <= MAX_BODY ? text : `${text.slice(0, MAX_BODY - CUT_MARKER.length)}${CUT_MARKER}`;
}

export const mediaKinds = ["image", "video", "audio", "document", "sticker"] as const;
export const isMediaKind = (kind: string): boolean => (mediaKinds as readonly string[]).includes(kind);

const plain: Readonly<Record<string, string>> = {
  image: "Sent a photo",
  video: "Sent a video",
  audio: "Sent a voice message",
  document: "Sent a document",
  sticker: "Sent a sticker",
  location: "Shared a location",
  contacts: "Shared a contact",
  unsupported: "Sent a message",
};

/** The lead's note for a first message: its words, or what kind of thing it was (at most 1,000 characters). */
export function firstTextOf(message: Pick<ParsedMessage, "kind" | "text" | "caption">): string {
  const words = message.text ?? message.caption ?? "";
  return (words.trim() === "" ? (plain[message.kind] ?? "Sent a message") : words).slice(0, 1000);
}

/** The first words of a message as the inbox list shows them, at most 80 characters. */
export function previewOf(message: { kind: string; body: string | null; caption: string | null }): string {
  const words = (message.body ?? message.caption ?? "").replace(/\s+/g, " ").trim();
  const text = words === "" ? (plain[message.kind] ?? "Message").replace(/^Sent a |^Shared a /, "") : words;
  const shown = words === "" ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return shown.length <= 80 ? shown : `${shown.slice(0, 79)}…`;
}

/** The columns of a message row for a parsed message, ready for create. */
export function messageColumns(message: ParsedMessage, now: Date) {
  const media = isMediaKind(message.kind) && message.mediaUrl !== null;
  return {
    kind: message.kind,
    body: boundedText(message.text),
    caption: boundedText(message.caption),
    fileName: message.fileName?.slice(0, 300) ?? null,
    latitude: message.latitude,
    longitude: message.longitude,
    wamid: message.wamid,
    quotedWamid: message.quotedWamid,
    occurredAt: message.occurredAt ?? now,
    mediaState: media ? "pending" : "none",
    mediaUrl: media ? message.mediaUrl : null,
  } as const;
}
