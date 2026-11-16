// A UUID made from a key, so asking again with the same key names the same id (a repeat that must be one record).
// Not in the kernel: it uses a Node built-in, and the kernel runs in the browser.
import { createHash } from "node:crypto";

/** An id made from a key (a uuid, version 8, the custom one): the same key always gives the same id. */
export function uuidFromKey(key: string): string {
  const bytes = createHash("sha256").update(key).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
