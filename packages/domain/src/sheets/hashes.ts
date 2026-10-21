// The hashes the sheets keep (S4, S19, S43): a row's identity, the keyed hashes of a spreadsheet and of an erased
// customer's contacts, and ids made from text so a retried job finds what it made. The key lives in the environment only.
import { createHash, createHmac } from "node:crypto";

/** Bytes a Prisma `Bytes` column takes. */
export type Bytes = Uint8Array<ArrayBuffer>;

export type ContactKind = "phone" | "email" | "instagram";

export interface SheetsHashes {
  /** HMAC-SHA256(key, spreadsheet id): which agency holds a spreadsheet (S4). */
  spreadsheetHash(spreadsheetId: string): Bytes;
  /** HMAC-SHA256(key, "<kind>:<normalised value>"): an erased customer's contact (S18, S43). */
  contactHash(kind: ContactKind, value: string): Bytes;
  /** HMAC-SHA256(key, the plain hash's bytes): an erased customer's row hash, which no guess of a phone can test. */
  rekey(plainHash: Uint8Array): Bytes;
}

const MIN_KEY_LENGTH = 32;

export function createSheetsHashes(key: string): SheetsHashes {
  if (key.length < MIN_KEY_LENGTH) throw new RangeError("SHEETS_HASH_KEY must be at least 32 characters");
  const hmac = (data: string | Uint8Array): Bytes => new Uint8Array(createHmac("sha256", key).update(data).digest());
  return {
    spreadsheetHash: (spreadsheetId) => hmac(spreadsheetId),
    contactHash: (kind, value) => hmac(`${kind}:${value}`),
    rekey: (plainHash) => hmac(plainHash),
  };
}

/**
 * SHA-256 of the JSON array of the row's cells, each trimmed and trailing empty cells dropped (S19): the same row typed
 * with spaces round it, or padded with empty cells by the sheet, is the same row; a gap inside it is not.
 */
export function rowHash(cells: readonly (string | null)[]): Bytes {
  const trimmed = cells.map((cell) => (cell ?? "").trim());
  while (trimmed.length > 0 && trimmed.at(-1) === "") trimmed.pop();
  return new Uint8Array(createHash("sha256").update(JSON.stringify(trimmed)).digest());
}

/** A UUID (version 5 in form) made from text alone, so a retried job finds the record its first run made. */
export function uuidFromText(text: string): string {
  const bytes = new Uint8Array(createHash("sha256").update(text).digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Which service account a new connection uses: SHA-256 of its id, modulo the number of accounts (S35). */
export function accountIndexFor(connectionId: string, accountCount: number): number {
  if (accountCount < 1) throw new RangeError("There is no service account to choose from");
  return createHash("sha256").update(connectionId).digest().readUInt32BE(0) % accountCount;
}

export function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
