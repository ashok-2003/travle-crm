// The message the service worker sends the app's open pages when a push arrives, so the bell asks again at once. The
// worker (src/service-worker/sw.ts) and the app share it; the app checks a message rather than trusting it, as
// another version of the worker may send others.
export const PUSH_ARRIVED = { type: "notification-arrived" } as const;

export function isPushArrived(data: unknown): boolean {
  return data !== null && typeof data === "object" && (data as { type?: unknown }).type === PUSH_ARRIVED.type;
}
