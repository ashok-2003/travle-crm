// What pg-boss stores about a failed job (its error) has no row-level security and is shown to platform staff, so a
// handler's error is cut down before pg-boss sees it. The original goes to the logs through onError.

const EMAIL = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/g;
// Seven or more digits, in one run or in groups split by spaces or hyphens: phone numbers, Aadhaar numbers.
const LONG_NUMBER = /\+?\d[\d\s-]{5,}\d/g;
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
 * A new Error for pg-boss to store: `Name: message` with email addresses and runs of 7 or more digits masked, at most
 * 200 characters, and no cause, extra properties or original stack. This is a safety net, not a filter: names,
 * addresses, PAN numbers, phone numbers written with dots or brackets, like (022) 2345.6789, and emails without a
 * domain pass through, so messages must stay ids-only.
 */
export function sanitizeJobError(error: unknown): Error {
  const original = toError(error);
  const text = `${original.name}: ${original.message}`
    .replace(EMAIL, "[email]")
    .replace(LONG_NUMBER, "[number]")
    .slice(0, MAX_LENGTH);
  const sanitized = new Error(text);
  sanitized.stack = text;
  return sanitized;
}
