// The adapters' safety net (ADR 0032): whatever a caller passes, a line leaves with personal keys censored at any
// depth, personal data masked in every string, and an Error reduced to its names, codes and frames. pino's `redact`
// paths can't reach an arbitrary depth, so the walk is ours.
import { maskPersonalData } from "../jobs/sanitize-job-error.js";
import { errorFields, StackFrames } from "./error-fields.js";
import type { LogFields } from "./logger.js";

const CENSORED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_STRING = 4000;

/** Keys that end in one of these are personal data or secrets (compared lower-case, without punctuation). */
const KEY_ENDINGS = [
  "email",
  "phone",
  "mobile",
  "password",
  "passwd",
  "token",
  "secret",
  "cookie",
  "authorization",
  "search",
  "query",
  "body",
];
/** Keys that are, whole, personal data or secrets. A word that merely ends alike ("context", "sortKey") is not one. */
const KEYS = new Set([
  "name",
  "fullname",
  "firstname",
  "lastname",
  "displayname",
  "username",
  "customername",
  "travellername",
  "contactname",
  "organizationname",
  "q",
  "message",
  "subject",
  "address",
  "url",
  "uri",
  "querystring",
  "headers",
  "pan",
  "aadhaar",
  "dob",
  "key",
  "apikey",
  "accesskey",
  "secretkey",
  "privatekey",
  "text",
  "content",
]);

function isPersonalKey(key: string): boolean {
  const plain = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return KEYS.has(plain) || KEY_ENDINGS.some((ending) => plain.endsWith(ending));
}

/** A whole number of this many digits is a phone or an Aadhaar number, whatever key holds it. */
const PHONE_DIGITS = 10;

function censorValue(value: unknown, depth: number): unknown {
  if (value instanceof StackFrames) return new StackFrames(value.text.slice(0, MAX_STRING));
  if (typeof value === "string") return maskPersonalData(value).slice(0, MAX_STRING);
  if (typeof value === "number" && Number.isInteger(value) && Math.abs(value) >= 10 ** (PHONE_DIGITS - 1)) {
    return "[number]";
  }
  if (typeof value === "bigint")
    return value.toString().replace(/\d/g, "").length === 0 && value.toString().length >= PHONE_DIGITS
      ? "[number]"
      : value.toString();
  if (typeof value !== "object" || value === null) return typeof value === "function" ? undefined : value;
  if (value instanceof Error) return errorFields(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (depth >= MAX_DEPTH) return CENSORED;
  if (Array.isArray(value)) return value.map((item: unknown) => censorValue(item, depth + 1));
  return censorObject(value as Record<string, unknown>, depth + 1);
}

function censorObject(fields: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = isPersonalKey(key) ? CENSORED : censorValue(value, depth);
  }
  return out;
}

export function censorFields(fields: LogFields): LogFields {
  return censorObject(fields, 0);
}

export function censorMessage(message: string): string {
  return maskPersonalData(message).slice(0, MAX_STRING);
}
