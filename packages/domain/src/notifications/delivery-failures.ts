// What a failed delivery means: whether trying again could help, what may be said about it, and recording that a
// channel is given up on. Messages here carry ids and codes, never addresses or notification text.
import { PushPayloadTooLargeError } from "@travel-crm/integrations/push";
import type { ListenerContext } from "../jobs/index.js";
import { markFailed, type Channel } from "./delivery-claims.js";

/** Every push subscription was forgotten by its push service: there is nobody left to send to, which is final. */
export class NothingToDeliverError extends Error {
  constructor() {
    super("There is no push subscription left to deliver to");
    this.name = "NothingToDeliverError";
  }
}

/** A failure that sending again cannot fix: bad content, an oversized push, or the mail server refusing the message. */
export function isPermanent(error: unknown): boolean {
  if (
    error instanceof RangeError ||
    error instanceof PushPayloadTooLargeError ||
    error instanceof NothingToDeliverError
  ) {
    return true;
  }
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  // A 5xx is permanent only when it is about this message. A refused login (EAUTH 535) or greeting (554) is about our
  // setup, and fixing the credentials fixes it: those retry.
  const aboutTheMessage = code === "EENVELOPE" || code === "EMESSAGE";
  return aboutTheMessage && typeof responseCode === "number" && responseCode >= 500 && responseCode < 600;
}

/** What to say about an error without personal data: its name and codes, never its message. */
function describe(error: unknown): string {
  const { name, code, responseCode } = (error ?? {}) as { name?: unknown; code?: unknown; responseCode?: unknown };
  return [name, code, responseCode].filter((part) => typeof part === "string" || typeof part === "number").join(" ");
}

/**
 * Runs one channel. A permanent failure is recorded (so it is not tried or reported again) and reported with ids
 * only; any other failure comes back, for the caller to raise once the other channel has had its turn.
 */
export async function attempt(
  context: ListenerContext,
  channel: Channel,
  id: string,
  log: (message: string) => void,
  run: () => Promise<void>,
): Promise<Error | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    if (!isPermanent(error))
      return error instanceof Error ? error : new Error(`Notification ${id}: ${channel.name} failed`);
    // Having nobody to send to is expected, not worth a log line.
    if (!(error instanceof NothingToDeliverError)) {
      log(`Notification ${id}: the ${channel.name} can't be delivered and won't be retried (${describe(error)})`);
    }
    try {
      await markFailed(context, id, channel);
    } catch (recordingError) {
      return recordingError instanceof Error ? recordingError : new Error(`Notification ${id}: recording failed`);
    }
    return undefined;
  }
}
