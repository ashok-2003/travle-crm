// What a failed delivery means: whether trying again could help, what may be said about it, and recording that a
// channel is given up on. Messages here carry ids and codes, never addresses or notification text.
import { ownMessage, ownMessages } from "@travel-crm/integrations/jobs";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import { PushPayloadTooLargeError } from "@travel-crm/integrations/push";
import type { ListenerContext } from "../jobs/index.js";
import { markFailed, type Channel } from "./delivery-claims.js";

/** Every push subscription was forgotten by its push service: there is nobody left to send to, which is final. */
export class NothingToDeliverError extends Error {
  static {
    ownMessages(this);
  }

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

/**
 * Runs one channel. A permanent failure is recorded (so it is not tried or reported again) and reported with ids
 * only; any other failure comes back, for the caller to raise once the other channel has had its turn.
 */
export async function attempt(
  context: ListenerContext,
  channel: Channel,
  id: string,
  logger: Logger,
  run: () => Promise<void>,
): Promise<Error | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    if (!isPermanent(error))
      return error instanceof Error ? error : ownMessage(new Error(`Notification ${id}: ${channel.name} failed`));
    // Having nobody to send to is expected, not worth a log line.
    if (!(error instanceof NothingToDeliverError)) {
      const { responseCode } = (error ?? {}) as { responseCode?: unknown };
      logger.warn(
        {
          notificationId: id,
          channel: channel.name,
          ...(typeof responseCode === "number" ? { responseCode } : {}),
          ...errorFields(error),
        },
        "A notification can't be delivered and won't be retried",
      );
    }
    try {
      await markFailed(context, id, channel);
    } catch (recordingError) {
      return recordingError instanceof Error
        ? recordingError
        : ownMessage(new Error(`Notification ${id}: recording failed`));
    }
    return undefined;
  }
}
