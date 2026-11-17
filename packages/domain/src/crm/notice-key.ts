// The key one kind of notice about an event is recorded under. A notification's unique key is (source event, person),
// with no kind, so two notices about one lead.created event (a lead nobody owns, and its slow-reply alert) need keys of
// their own: a UUID-shaped hash (version 8, SHA-256) of the kind and the event's id, the same for a repeat of the same
// notice. It de-duplicates, it protects nothing; SHA-256 keeps code scanning from reading it as weak cryptography.
import { createHash } from "node:crypto";

export function noticeKey(eventId: string, kind: string): string {
  const bytes = createHash("sha256").update(`${kind}:${eventId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
