// What pg-boss stores about a failed job (its error) has no row-level security and is shown to platform staff, so a
// handler's error is cut down before pg-boss sees it. It keeps a message only when our own code wrote it; anyone
// else's error (Prisma's, the AWS SDK's, nodemailer's, pg's) keeps its names and codes only, as the log does.
import { describeError } from "./describe-error.js";

/**
 * The registry key set on an error, or a class's prototype, whose message our own code writes from ids and codes. The
 * domain kernel marks DomainError with the same key without importing this module (it stays browser-safe); a test
 * checks the two strings agree.
 */
export const OWN_MESSAGE_KEY = "@travel-crm/own-message";
const OWN_MESSAGE = Symbol.for(OWN_MESSAGE_KEY);

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
 * Marks an error our own code made, whose message it wrote from ids and codes (not a library's, which may quote data):
 * pg-boss keeps that message, masked. Returns the error, for `throw ownMessage(new Error(...))`.
 */
export function ownMessage<E extends Error>(error: E): E {
  Object.defineProperty(error, OWN_MESSAGE, { value: true });
  return error;
}

/** Marks every error of a class our own code defines, such as DomainError, as ownMessage marks one. */
export function ownMessages(errorClass: abstract new (...args: never[]) => Error): void {
  Object.defineProperty(errorClass.prototype, OWN_MESSAGE, { value: true });
}

function hasOwnMessage(error: unknown): error is Error {
  return error instanceof Error && (error as unknown as Record<symbol, unknown>)[OWN_MESSAGE] === true;
}

/**
 * A new Error for pg-boss to store, at most 200 characters, with no cause, extra properties or original stack. An
 * error our code wrote (ownMessage, ownMessages) keeps `Name: message`, masked by maskPersonalData. Any other keeps
 * only its names and codes (describeError): a library's message can quote what it was given, as a Prisma validation
 * error quotes the query's values, names and all, which no masking catches.
 */
export function sanitizeJobError(error: unknown): Error {
  const text = (
    hasOwnMessage(error) ? maskPersonalData(`${error.name}: ${error.message}`) : describeError(error)
  ).slice(0, MAX_LENGTH);
  const sanitized = new Error(text);
  sanitized.stack = text;
  return sanitized;
}
