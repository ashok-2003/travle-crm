// An in-memory PushSender for tests: it records pushes, and endpoints marked gone answer "gone" as a push service
// would for a dropped subscription.
import type { PushPayload, PushSender, PushSubscriptionKeys } from "./push-sender.js";

export interface SentPush {
  subscription: PushSubscriptionKeys;
  payload: PushPayload;
}

export interface MemoryPushSender extends PushSender {
  /** Every push delivered so far, oldest first. */
  readonly sent: readonly SentPush[];
  /** From now on, pushes to this endpoint answer "gone". */
  markGone(endpoint: string): void;
}

export function createMemoryPushSender(): MemoryPushSender {
  const sent: SentPush[] = [];
  const gone = new Set<string>();
  return {
    sent,
    markGone: (endpoint) => {
      gone.add(endpoint);
    },
    send: (subscription, payload) => {
      if (gone.has(subscription.endpoint)) return Promise.resolve("gone");
      sent.push({ subscription, payload });
      return Promise.resolve("sent");
    },
  };
}
