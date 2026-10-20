// The Google Sheets settings (spec 14): the service accounts' keys, decoded from GOOGLE_SHEETS_SERVICE_ACCOUNTS. Nothing
// in an error or a log ever holds a part of the value: it is a secret.
import { createHmac, createPrivateKey } from "node:crypto";
import type { ServiceAccountKey } from "@travel-crm/integrations/google-sheets";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A key file's fields we use: an email address and a private key, both text. */
function keyOf(value: unknown): ServiceAccountKey | null {
  if (!isRecord(value)) return null;
  const { client_email: email, private_key: key } = value;
  if (typeof email !== "string" || typeof key !== "string") return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(email.trim()) || !canSign(key)) return null;
  return { client_email: email.trim(), private_key: key };
}

/** Whether the key parses as a private key now, not at the first signing: a pasted "\\n" for a newline fails here (SC4). */
function canSign(key: string): boolean {
  try {
    createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

/** SC8: a key a person typed or copied from an example is no key: fewer than 10 different characters, or too short. */
export function sheetsHashKeyIsWeak(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length < 32 || new Set(trimmed).size < 10;
}

/**
 * SC8: a value every process derives from SHEETS_HASH_KEY alone and compares with the one stored when the first process
 * started, so a console and a worker holding different keys are caught at start-up. It is an HMAC of a constant: it
 * says nothing of the key, and holds no personal data.
 */
export function sheetsHashKeyCheckValue(key: string): Buffer {
  return createHmac("sha256", key).update("travel-crm sheets hash key check v1").digest();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * GOOGLE_SHEETS_SERVICE_ACCOUNTS: one key file's JSON, or a JSON list of several, as single-line JSON or base64 of it.
 * Each needs a client_email and a private_key. Null when it is none of those; the text is never kept.
 */
export function decodeServiceAccounts(text: string): ServiceAccountKey[] | null {
  const trimmed = text.trim();
  const plain = /^[[{]/.test(trimmed);
  const json = plain
    ? parseJson(trimmed)
    : /^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)
      ? parseJson(Buffer.from(trimmed, "base64").toString("utf8"))
      : undefined;
  const list = Array.isArray(json) ? (json as unknown[]) : [json];
  if (json === undefined || list.length === 0) return null;
  const keys = list.map(keyOf);
  return keys.every((key) => key !== null) ? keys : null;
}

/** The start-up line for the api and the worker: how many accounts were read, and nothing of them. */
export function sheetsStartUpLine(accountCount: number): string {
  if (accountCount === 0) return "Google Sheets: not set up";
  return `Google Sheets: ${String(accountCount)} service account${accountCount === 1 ? "" : "s"}`;
}
