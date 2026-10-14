// The web push port (spec 9.4): send one notification to one browser subscription.

/** What a browser hands over when it subscribes (PushSubscription.toJSON(): endpoint and keys). */
export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key, base64url. */
  p256dh: string;
  /** The browser's authentication secret, base64url. */
  auth: string;
}

/** What the service worker shows. `url` is where a tap opens, a path inside the web app. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string | undefined;
}

export interface PushSender {
  /**
   * Sends the notification. "gone" means the push service no longer knows the subscription (the person
   * unsubscribed or the browser dropped it): delete it. Any other failure throws, so the job retries.
   */
  send(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<"sent" | "gone">;
}

/** The most a push service accepts: 4096 bytes, less the encryption's overhead. */
export const MAX_PUSH_PAYLOAD_BYTES = 3993;

/**
 * The notification is too big to send. Permanent: sending it again fails the same way, so jobs must not retry it.
 * The message holds no notification text.
 */
export class PushPayloadTooLargeError extends Error {
  readonly code = "PUSH_PAYLOAD_TOO_LARGE";

  constructor(bytes: number) {
    super(
      `The push payload is ${String(bytes)} bytes, over the ${String(MAX_PUSH_PAYLOAD_BYTES)} a push service takes`,
    );
    this.name = "PushPayloadTooLargeError";
  }
}
