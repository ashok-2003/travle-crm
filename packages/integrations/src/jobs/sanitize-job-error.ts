// What pg-boss stores about a failed job (its error) has no row-level security and is shown to platform staff, so a
// handler's error is cut down before pg-boss sees it. The log gets only its names and codes (describeError).

// An address's local part stops at a URL's own punctuation, so "?to=jane@example.com" keeps "?to=".
const EMAIL = /[^\s@<>()[\]",;:/?&=#]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/g;
// What a number stands between: neither side may touch a letter, a digit or a hyphen, so digits inside a word, a
// code or an id are left alone.
const ALONE_BEFORE = String.raw`(?<![\p{L}\p{N}-])`;
const ALONE_AFTER = String.raw`(?![\p{L}\p{N}-])`;
// A UUID is kept whole, even one whose groups happen to be all digits (it would read as a number split by hyphens).
const UUID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
// Seven or more digits, in one run or in groups split by spaces or hyphens: phone numbers, Aadhaar numbers.
const LONG_NUMBER = String.raw`\+?\d[\d\s-]{5,}\d`;
const UUID_OR_LONG_NUMBER = new RegExp(
  `${ALONE_BEFORE}(${UUID})${ALONE_AFTER}|${ALONE_BEFORE}${LONG_NUMBER}${ALONE_AFTER}`,
  "giu",
);
const MAX_LENGTH = 200;

/** Anything that was thrown, as an Error: pg-boss's warnings and some libraries' errors are plain objects. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") {
    return new Error(value.message);
  }
  return new Error(String(value));
}

/**
 * Text with email addresses and runs of 7 or more digits masked. A run is masked only when it stands alone, so UUIDs
 * and other ids stay readable. This is a safety net, not a filter: names, addresses, PAN numbers, phone numbers
 * written with dots or brackets, like (022) 2345.6789, numbers run into a word, and emails without a domain pass
 * through, so text meant for a log or a table must stay ids-only.
 */
export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(UUID_OR_LONG_NUMBER, (match, uuid: string | undefined) => (uuid === undefined ? "[number]" : match));
}

/**
 * A new Error for pg-boss to store: `Name: message` masked by maskPersonalData, at most 200 characters, and no cause,
 * extra properties or original stack.
 */
export function sanitizeJobError(error: unknown): Error {
  const original = toError(error);
  const text = maskPersonalData(`${original.name}: ${original.message}`).slice(0, MAX_LENGTH);
  const sanitized = new Error(text);
  sanitized.stack = text;
  return sanitized;
}
