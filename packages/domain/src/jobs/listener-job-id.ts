// The job id for one listener's run on one event: the same every time, so relaying an event twice queues it once.
import { createHash } from "node:crypto";

/**
 * A UUID (version 8, RFC 9562) derived from the listener's name and the event's id. pg-boss queues a job id once, so
 * a relay that crashes after sending and relays the event again sends nothing new. pg-boss does this only while it
 * still keeps the first job (completed jobs are deleted after a while); the per-event record in processed_event is the
 * backstop for a late repeat.
 */
export function listenerJobId(listenerName: string, eventId: string): string {
  const bytes = createHash("sha256").update(`${listenerName}\n${eventId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
