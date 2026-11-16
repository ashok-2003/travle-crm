// What leaves for the tracing service has its phone numbers and email addresses masked (the owner sends the chats' words, not
// their contacts). The span processor hands each input, output and metadata value over as JSON text or as decoded JSON:
// strings are masked where they stand, so ids, amounts and counts stay as they were and JSON stays JSON.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/**
 * A number touching a letter, a digit, "_" or "-" is part of something else (an id, a longer number), never a phone: a
 * uuid's digits can never be taken for one.
 */
const BEFORE = String.raw`(?<![\p{L}\p{N}_+-])`;
const AFTER = String.raw`(?![\p{L}\p{N}_-])`;
/** Any country's number written with its "+" code: 8 to 15 digits, single spaces or dashes between them. */
const INTERNATIONAL = new RegExp(String.raw`${BEFORE}\+[1-9](?:[\s-]?\d){7,14}${AFTER}`, "gu");
/** An Indian mobile without a "+": 10 digits from 6 to 9, perhaps after 91 or 0. */
const INDIAN = new RegExp(String.raw`${BEFORE}(?:91[\s-]?|0)?[6-9](?:[\s-]?\d){9}${AFTER}`, "gu");

export function maskContacts(text: string): string {
  return text.replace(EMAIL, "[email]").replace(INTERNATIONAL, "[phone]").replace(INDIAN, "[phone]");
}

function maskValue(value: unknown): unknown {
  if (typeof value === "string") return maskContacts(value);
  if (Array.isArray(value)) return value.map(maskValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, maskValue(inner)]));
  }
  return value;
}

/**
 * The span processor's mask: input and output come as JSON text (or text that is not JSON), metadata as decoded values.
 * JSON text that holds an object, an array or a string is masked inside and written again; anything else is masked as text.
 */
export function maskTraceData({ data }: { data: unknown }): unknown {
  if (typeof data !== "string") return maskValue(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return maskContacts(data);
  }
  return parsed !== null && (typeof parsed === "object" || typeof parsed === "string")
    ? JSON.stringify(maskValue(parsed))
    : maskContacts(data);
}
