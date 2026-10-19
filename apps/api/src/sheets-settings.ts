// The Google Sheets settings (spec 14): the service accounts' keys, decoded from GOOGLE_SHEETS_SERVICE_ACCOUNTS. Nothing
// in an error or a log ever holds a part of the value: it is a secret.
import type { ServiceAccountKey } from "@travel-crm/integrations/google-sheets";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A key file's fields we use: an email address and a private key, both text. */
function keyOf(value: unknown): ServiceAccountKey | null {
  if (!isRecord(value)) return null;
  const { client_email: email, private_key: key } = value;
  if (typeof email !== "string" || typeof key !== "string") return null;
  return /^[^\s@]+@[^\s@]+$/.test(email.trim()) && key.trim() !== ""
    ? { client_email: email.trim(), private_key: key }
    : null;
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
