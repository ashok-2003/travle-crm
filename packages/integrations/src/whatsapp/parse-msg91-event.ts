// Reads MSG91's webhook body into events (ADR 0035). Tolerant on purpose: MSG91's pages name the same field several ways,
// carry JSON inside strings, and may send one object or a list. It never throws and never logs the body.
// SPIKE(S1, S2): every field alias and the inbound/echo/status rules rest on MSG91's public samples until a real account
// shows the payloads; fixes stay in this file and its fixtures.
import type { ParsedEvent, ParsedMessage, WhatsAppMessageKind, WhatsAppStatus } from "./parsed-event.js";

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON inside a string is read once; anything else is returned as it is. */
function unstring(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

/** The first of the names that holds a non-empty string or a number, as a trimmed string. */
function pick(bag: Bag, names: readonly string[]): string | null {
  for (const name of names) {
    const value = bag[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberOf(bag: Bag, names: readonly string[]): number | null {
  const text = pick(bag, names);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** "+<digits>": ten digits are an Indian number; anything else keeps its own country code. Null when there are too few. */
export function customerNumberOf(raw: string | null): string | null {
  if (raw === null) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** The digits of our own number, as MSG91 writes it. */
function integratedOf(bag: Bag): string | null {
  const digits = pick(bag, [
    "integratedNumber",
    "integrated_number",
    "businessNumber",
    "display_phone_number",
  ])?.replace(/\D/g, "");
  return digits === undefined || digits === "" ? null : digits;
}

function timeOf(bag: Bag): Date | null {
  const raw = pick(bag, ["ts", "timestamp", "requestedAt", "requested_at", "time"]);
  if (raw === null) return null;
  const asNumber = Number(raw);
  const date = Number.isFinite(asNumber) ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber) : new Date(raw);
  return Number.isNaN(date.getTime()) || date.getFullYear() < 2015 ? null : date;
}

const statusNames: Readonly<Record<string, WhatsAppStatus>> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  seen: "read",
  failed: "failed",
  failure: "failed",
  undelivered: "failed",
};

const kindNames: Readonly<Record<string, WhatsAppMessageKind>> = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  voice: "audio",
  ptt: "audio",
  document: "document",
  file: "document",
  sticker: "sticker",
  location: "location",
  contacts: "contacts",
  contact: "contacts",
  reaction: "reaction",
  button: "text",
  interactive: "text",
};

/** The words of a button or list reply, or null. */
function replyText(bag: Bag): string | null {
  for (const name of ["button", "interactive"]) {
    const value = unstring(bag[name]);
    if (typeof value === "string" && value !== "") return value.trim() || null;
    if (isBag(value)) {
      const nested = pick(value, ["text", "title", "payload"]);
      if (nested !== null) return nested;
      for (const inner of Object.values(value)) {
        const parsed = unstring(inner);
        if (isBag(parsed)) {
          const title = pick(parsed, ["title", "text"]);
          if (title !== null) return title;
        }
      }
    }
  }
  return null;
}

function messageOf(bag: Bag, wamid: string, integratedNumber: string, customerNumber: string): ParsedMessage {
  const contentType = (pick(bag, ["contentType", "content_type", "type", "messageType"]) ?? "text").toLowerCase();
  const kind = kindNames[contentType] ?? "unsupported";
  const reactionValue = unstring(bag.reaction);
  const reaction =
    kind === "reaction"
      ? {
          emoji: isBag(reactionValue)
            ? (pick(reactionValue, ["emoji", "text"]) ?? "")
            : typeof reactionValue === "string"
              ? reactionValue
              : (pick(bag, ["text"]) ?? ""),
          targetWamid: isBag(reactionValue)
            ? pick(reactionValue, ["messageId", "message_id", "wamid", "id"])
            : pick(bag, ["replyMsgId", "reply_msg_id"]),
        }
      : null;
  const textual = contentType === "button" || contentType === "interactive";
  return {
    wamid,
    integratedNumber,
    customerNumber,
    customerName: pick(bag, ["customerName", "customer_name", "profileName", "name"]),
    occurredAt: timeOf(bag),
    kind,
    text:
      kind === "text"
        ? textual
          ? (replyText(bag) ?? pick(bag, ["text", "message"]))
          : pick(bag, ["text", "message", "body"])
        : null,
    caption: pick(bag, ["caption"]),
    fileName: pick(bag, ["filename", "fileName", "file_name"]),
    mediaUrl: ["image", "video", "audio", "document", "sticker"].includes(kind)
      ? pick(bag, ["url", "mediaUrl", "media_url", "link"])
      : null,
    latitude: numberOf(bag, ["latitude", "lat"]),
    longitude: numberOf(bag, ["longitude", "lng", "long"]),
    quotedWamid:
      kind === "reaction" ? null : pick(bag, ["replyMsgId", "reply_msg_id", "contextMessageId", "quotedMessageId"]),
    reaction,
  };
}

function eventOf(bag: Bag): ParsedEvent {
  const integratedNumber = integratedOf(bag);
  const wamid = pick(bag, ["uuid", "wamid", "messageId", "message_id", "id"]);
  const customerNumber = customerNumberOf(
    pick(bag, ["customerNumber", "customer_number", "mobile", "recipient_number", "from"]),
  );
  const eventName = pick(bag, ["eventName", "event_name", "status", "event"])?.toLowerCase() ?? null;
  const direction = pick(bag, ["direction"]);
  if (integratedNumber === null || wamid === null) return { type: "unknown", integratedNumber };

  const status = eventName === null ? undefined : statusNames[eventName];
  if (status !== undefined) {
    return {
      type: "status",
      wamid,
      integratedNumber,
      status,
      reasonCode: status === "failed" ? (pick(bag, ["reason", "errorCode", "error_code", "code"]) ?? "unknown") : null,
      occurredAt: timeOf(bag),
    };
  }
  if (customerNumber === null) return { type: "unknown", integratedNumber };
  // MSG91 writes direction "0" for inbound and "1" for outbound; a message with a content type and no status name is a
  // message. SPIKE(S2): an outbound one with no status name is taken to be an echo from the phone app.
  const outbound = direction === "1" || direction?.toLowerCase() === "outbound";
  return { type: outbound ? "echo" : "inbound", ...messageOf(bag, wamid, integratedNumber, customerNumber) };
}

/** The events in a body: one object, a list, or an object holding a list. A body that is none of these has none. */
function bagsOf(body: unknown): Bag[] {
  const value = unstring(body);
  if (Array.isArray(value)) return value.map(unstring).filter(isBag);
  if (!isBag(value)) return [];
  for (const name of ["events", "data"]) {
    const nested = unstring(value[name]);
    if (Array.isArray(nested) && nested.length > 0 && nested.every((item) => isBag(unstring(item)))) {
      return nested.map(unstring).filter(isBag);
    }
  }
  return [value];
}

/** Every event in an MSG91 webhook body; an unreadable body gives one unknown event, so it is still counted. */
export function parseMsg91Event(body: unknown): ParsedEvent[] {
  try {
    const bags = bagsOf(body);
    if (bags.length === 0) return [{ type: "unknown", integratedNumber: null }];
    return bags.map((bag) => {
      try {
        return eventOf(bag);
      } catch {
        return { type: "unknown", integratedNumber: null } as const;
      }
    });
  } catch {
    return [{ type: "unknown", integratedNumber: null }];
  }
}
