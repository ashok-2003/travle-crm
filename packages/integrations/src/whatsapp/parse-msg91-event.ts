// Reads MSG91's webhook body into events (ADR 0035). Tolerant on purpose: MSG91's pages name the same field several ways,
// carry JSON inside strings, and may send one object or a list. It never throws and never logs the body.
// SPIKE(S1, S2): every field alias and the inbound/echo/status rules rest on MSG91's public samples until a real account
// shows the payloads; fixes stay in this file and its fixtures.
import type {
  ParsedEvent,
  ParsedMessage,
  UnsupportedReason,
  WhatsAppMessageKind,
  WhatsAppStatus,
} from "./parsed-event.js";

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
    // A string that still looks like JSON failed to parse: it is not words anyone typed.
    if (typeof value === "string" && value !== "" && !/^\s*[{[]/.test(value)) return value.trim() || null;
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

interface Tap {
  /** Exactly as WhatsApp returned it: 1 to 256 characters, no control characters (what we send is checked the same way). */
  id: string;
  title: string | null;
  kind: Exclude<ParsedMessage["replyKind"], null>;
}

/** An id kept as it came, or null: a string only, never trimmed or rewritten, within WhatsApp's own limit. */
function exactId(value: unknown): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= 256 && !/\p{Cc}/u.test(value) ? value : null;
}

/** A tap in Meta's `interactive` object: a button reply or a list row. */
function tapInInteractive(value: unknown): Tap | null {
  const interactive = unstring(value);
  if (!isBag(interactive)) return null;
  for (const [names, kind] of [
    [["button_reply", "buttonReply"], "button"],
    [["list_reply", "listReply"], "list"],
  ] as const) {
    for (const name of names) {
      const reply = unstring(interactive[name]);
      if (!isBag(reply)) continue;
      const id = exactId(reply.id);
      if (id !== null) return { id, title: pick(reply, ["title"]), kind };
    }
  }
  return null;
}

/**
 * The button or list row the customer tapped, and its id. SPIKE(S1): MSG91 does not document where the id arrives, so every
 * likely place is read in turn: `interactive` (an object or a JSON string), Meta's raw message in `messages`, then a template's
 * quick reply in `button.payload`. A tap that carries no id here still reads as its title (the caller's text).
 */
function tapOf(bag: Bag): Tap | null {
  const direct = tapInInteractive(bag.interactive);
  if (direct !== null) return direct;
  const raw = unstring(bag.messages);
  for (const message of Array.isArray(raw) ? raw : [raw]) {
    const parsed = unstring(message);
    if (isBag(parsed)) {
      const inMessage = tapInInteractive(parsed.interactive);
      if (inMessage !== null) return inMessage;
    }
  }
  const button = unstring(bag.button);
  if (isBag(button)) {
    // A template's quick reply carries text from the template's own setup, so it is never a reply button of ours.
    const payload = exactId(button.payload);
    if (payload !== null) return { id: payload, title: pick(button, ["text", "title"]), kind: "quick_reply" };
  }
  return null;
}

/** Third-party text made safe to store and show: whitespace runs become one space, control characters (NUL included, which Postgres refuses) go. */
function cleaned(value: string | null): string | null {
  if (value === null) return null;
  const text = value
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();
  return text === "" ? null : text;
}

/** Meta's raw message, which MSG91 forwards in `messages` (a list, or a list inside a string); empty when there is none. */
function metaMessageOf(bag: Bag): Bag {
  const raw = unstring(bag.messages);
  const first = unstring(Array.isArray(raw) ? raw[0] : raw);
  return isBag(first) ? first : {};
}

/**
 * A Meta-shaped `referral` (a click-to-WhatsApp ad). SPIKE(S1): MSG91 may nest it, so five places are tried; a message from an
 * ad (content type "referral") carries it only in Meta's own message.
 */
function referralOf(bag: Bag): ParsedMessage["referral"] {
  for (const holder of [bag, bag.message, bag.context, bag.content, metaMessageOf(bag)].map(unstring)) {
    if (!isBag(holder)) continue;
    const referral = unstring(holder.referral);
    if (!isBag(referral)) continue;
    const sourceId = cleaned(pick(referral, ["source_id", "sourceId"]));
    const headline = cleaned(pick(referral, ["headline"]));
    if (sourceId === null && headline === null) continue;
    return { sourceId, headline, sourceUrl: cleaned(pick(referral, ["source_url", "sourceUrl"])) };
  }
  return null;
}

/** MSG91's name for what a message is: a phone echo has `contentType`, an echo of our own send only `messageType`. */
const typeOf = (bag: Bag): string =>
  (pick(bag, ["contentType", "content_type", "type", "messageType"]) ?? "text").toLowerCase();

/** Where Meta's own fields may sit in an event: the event, its `content` (a JSON string) or Meta's raw message. */
const holdersOf = (bag: Bag): Bag[] => [bag, unstring(bag.content), metaMessageOf(bag)].filter(isBag);

/** Why WhatsApp could not pass a message on: error 131060 is unavailable, an album is one set of photos, anything else unknown. */
function unsupportedReasonOf(bag: Bag): UnsupportedReason {
  const codes: string[] = [];
  let kind: string | null = null;
  for (const holder of holdersOf(bag)) {
    const errors = unstring(holder.errors);
    for (const error of Array.isArray(errors) ? errors : []) {
      const code = isBag(unstring(error)) ? pick(unstring(error) as Bag, ["code"]) : null;
      if (code !== null) codes.push(code);
    }
    const unsupported = unstring(holder.unsupported);
    if (isBag(unsupported)) kind ??= pick(unsupported, ["type"]);
  }
  if (codes.includes("131060")) return "unavailable";
  return kind?.toLowerCase() === "album" ? "album" : "unknown";
}

/** An edit's or a deletion's target (and the edit's new words), wherever Meta's `edit` or `revoke` object sits; null when it names no original. */
function changeOf(bag: Bag, kind: "edit" | "revoke"): { originalWamid: string; text: string | null } | null {
  for (const holder of holdersOf(bag)) {
    const change = unstring(holder[kind]);
    if (!isBag(change)) continue;
    const originalWamid = pick(change, ["original_message_id", "originalMessageId"]);
    if (originalWamid === null) continue;
    const message = unstring(change.message);
    const text = unstring(isBag(message) ? message.text : change.text);
    const words = isBag(text) ? pick(text, ["body"]) : typeof text === "string" ? text.trim() || null : null;
    return { originalWamid, text: words === null ? null : words.replaceAll(String.fromCharCode(0), "") };
  }
  return null;
}

function messageOf(bag: Bag, wamid: string, integratedNumber: string, customerNumber: string): ParsedMessage {
  // MSG91 keeps a file's link, and the words of an echo of our own send, only in `content` (a JSON string): read after the
  // top-level names.
  const inContent = unstring(bag.content);
  const content = isBag(inContent) ? inContent : {};
  // A message from an ad has its words only in Meta's own message.
  const metaText = unstring(metaMessageOf(bag).text);
  const metaWords = isBag(metaText) ? pick(metaText, ["body"]) : null;
  const typeName = typeOf(bag);
  const contentType = typeName === "referral" && metaWords !== null ? "text" : typeName;
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
  // Only an interactive or button event can be a tap: MSG91 sends empty `interactive` and `button` fields on every message.
  const tap = kind === "text" && textual ? tapOf(bag) : null;
  // Only a plain word is kept: the name goes into a log line, where nothing a customer wrote may go.
  const unsupportedReason = kind === "unsupported" ? unsupportedReasonOf(bag) : null;
  const unknownType = kind === "unsupported" ? (/^[a-z0-9_.-]{1,40}$/.test(contentType) ? contentType : "other") : null;
  return {
    ...(unknownType === null ? {} : { unknownType }),
    ...(unsupportedReason === null ? {} : { unsupportedReason }),
    wamid,
    integratedNumber,
    customerNumber,
    customerName: pick(bag, ["customerName", "customer_name", "profileName", "name"]),
    occurredAt: timeOf(bag),
    kind,
    text:
      kind === "text"
        ? textual
          ? (cleaned(tap?.title ?? null) ?? replyText(bag) ?? pick(bag, ["text", "message"]) ?? pick(content, ["text"]))
          : (pick(bag, ["text", "message", "body"]) ?? pick(content, ["text"]) ?? metaWords)
        : null,
    ...(tap === null ? { buttonReplyId: null, replyKind: null } : { buttonReplyId: tap.id, replyKind: tap.kind }),
    caption: pick(bag, ["caption"]) ?? pick(content, ["caption"]),
    fileName: pick(bag, ["filename", "fileName", "file_name"]) ?? pick(content, ["filename"]),
    mediaUrl: ["image", "video", "audio", "document", "sticker"].includes(kind)
      ? (pick(bag, ["url", "mediaUrl", "media_url", "link"]) ?? pick(content, ["attachment_url"]))
      : null,
    latitude: numberOf(bag, ["latitude", "lat"]),
    longitude: numberOf(bag, ["longitude", "lng", "long"]),
    quotedWamid:
      kind === "reaction" ? null : pick(bag, ["replyMsgId", "reply_msg_id", "contextMessageId", "quotedMessageId"]),
    reaction,
    referral: referralOf(bag),
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
  const requestId = pick(bag, ["requestId", "request_id"]);
  if (integratedNumber === null || wamid === null) return { type: "unknown", integratedNumber };

  const status = eventName === null ? undefined : statusNames[eventName];
  if (status !== undefined) {
    return {
      type: "status",
      wamid,
      integratedNumber,
      customerNumber,
      requestId,
      status,
      reasonCode: status === "failed" ? (pick(bag, ["reason", "errorCode", "error_code", "code"]) ?? "unknown") : null,
      occurredAt: timeOf(bag),
    };
  }
  const changeKind = typeOf(bag);
  if (changeKind === "edit" || changeKind === "revoke") {
    // An edit or a deletion lands on its original; one that names none (or an edit with no words) is dropped.
    const change = changeOf(bag, changeKind);
    if (change === null || customerNumber === null || (changeKind === "edit" && change.text === null)) {
      return { type: "ignored", integratedNumber };
    }
    return {
      type: "change",
      kind: changeKind,
      fromPhone: direction === "1" || direction?.toLowerCase() === "outbound",
      originalWamid: change.originalWamid,
      text: changeKind === "edit" ? change.text : null,
      wamid,
      integratedNumber,
      customerNumber,
      customerName: pick(bag, ["customerName", "customer_name", "profileName", "name"]),
      occurredAt: timeOf(bag),
    };
  }
  if (customerNumber === null) return { type: "unknown", integratedNumber };
  // MSG91 writes direction "0" for inbound and "1" for outbound; a message with a content type and no status name is a
  // message. An outbound one with no status name is an echo: sent from the phone app, or one of our own sends.
  const outbound = direction === "1" || direction?.toLowerCase() === "outbound";
  const message = messageOf(bag, wamid, integratedNumber, customerNumber);
  if (!outbound) return { type: "inbound", ...message };
  // Our own api's sends come back with a messageType and no contentType; the phone app's always carry one.
  return { type: "echo", requestId, ourSend: pick(bag, ["contentType", "content_type"]) === null, ...message };
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
