// The adapters' safety net (ADR 0032): whatever a caller passes, a line leaves with personal keys censored at any
// depth, personal data masked in every string, and an Error reduced to its names, codes and frames. pino's `redact`
// paths can't reach an arbitrary depth, so the walk is ours.
import { maskPersonalData } from "../jobs/sanitize-job-error.js";
import { errorFields } from "./error-fields.js";
import type { LogFields } from "./logger.js";

const CENSORED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_STRING = 4000;

/** Keys that are personal data or secrets whatever their value (compared lower-case, without punctuation). */
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
  "key",
  "search",
  "query",
  "body",
  "text",
  "content",
];
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
]);

function isPersonalKey(key: string): boolean {
  const plain = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return KEYS.has(plain) || KEY_ENDINGS.some((ending) => plain.endsWith(ending));
}

function censorValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return maskPersonalData(value).slice(0, MAX_STRING);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return typeof value === "function" ? undefined : value;
  if (value instanceof Error) return errorFields(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (depth >= MAX_DEPTH) return CENSORED;
  if (Array.isArray(value)) return value.map((item: unknown) => censorValue(item, depth + 1));
  return censorObject(value as Record<string, unknown>, depth + 1);
}

/**
 * A stack's frames are code's own (function names, file paths): masking them would read a package path such as
 * `pg-boss@12.37.1_pg@8.20.0` as an email address. errorFields cuts the message out of a stack before it gets here.
 */
const FRAMES_KEY = "errorStack";

function censorObject(fields: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === FRAMES_KEY && typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else out[key] = isPersonalKey(key) ? CENSORED : censorValue(value, depth);
  }
  return out;
}

export function censorFields(fields: LogFields): LogFields {
  return censorObject(fields, 0);
}

export function censorMessage(message: string): string {
  return maskPersonalData(message).slice(0, MAX_STRING);
}
