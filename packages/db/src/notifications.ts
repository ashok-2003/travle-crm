// Hears Postgres NOTIFY on one channel, on a connection of its own: LISTEN is session state, so it never goes on a pooled
// connection. The api listens on INBOX_LIVE_CHANNEL, which the triggers of migration 20261218800000_inbox_live notify on
// commit whenever a WhatsApp message or a chat's row changes. A lost connection is opened again (a second apart at first,
// at most 30 s apart after), and a quiet one is asked a SELECT 1 now and then: one that gets no answer in 10 s, like one
// that never finishes opening, is dropped and opened again, so a connection that died without a word is noticed. What was
// notified while it was down is lost: onReconnected says so, for the caller to catch up.
import pg from "pg";

/** The inbox's channel: {"organizationId", "conversationId", "change", "direction"?}, ids and words of ours only. */
export const INBOX_LIVE_CHANNEL = "inbox_live";

/** The application_name of a listener's connection. */
export const listenerName = (channel: string) => `travel-crm-listen:${channel}`;

export interface NotificationHandlers {
  /** A notification's payload, as it was sent. */
  onNotification(payload: string): void;
  /** The connection was lost and is listening again: whatever was notified in between was missed. */
  onReconnected?(): void;
  /** The connection failed or was lost (it is opened again by itself); for the log. */
  onError?(error: unknown): void;
}

export interface NotificationListener {
  /** Settles once the first LISTEN is in place (it keeps trying until then). */
  listening: Promise<void>;
  close(): Promise<void>;
}

export interface ListenOptions {
  /** The first wait before opening a lost connection again, doubled after each failure up to `maxRetryMs`. */
  retryMs?: number;
  maxRetryMs?: number;
  /** How often a quiet connection is asked SELECT 1. */
  pingMs?: number;
  /** How long a ping, or opening the connection, may wait for Postgres before the connection is dropped. */
  answerWithinMs?: number;
}

export function listenForNotifications(
  url: string,
  channel: string,
  handlers: NotificationHandlers,
  { retryMs = 1_000, maxRetryMs = 30_000, pingMs = 30_000, answerWithinMs = 10_000 }: ListenOptions = {},
): NotificationListener {
  let closed = false;
  // Read through a function: it changes while a connection opens, which TypeScript's narrowing can't see.
  const isClosed = () => closed;
  let current: pg.Client | null = null;
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let everListened = false;
  const dropped = new WeakSet<pg.Client>();
  let markListening: () => void = () => undefined;
  const listening = new Promise<void>((resolve) => {
    markListening = resolve;
  });

  const scheduleRetry = () => {
    if (closed || retry !== undefined) return;
    const delay = Math.min(maxRetryMs, retryMs * 2 ** failures);
    failures += 1;
    retry = setTimeout(() => {
      retry = undefined;
      void open();
    }, delay);
  };

  /** Lets a connection go, once, and opens another unless the listener is closing. */
  const drop = (client: pg.Client) => {
    if (dropped.has(client)) return;
    dropped.add(client);
    if (current === client) {
      current = null;
      clearInterval(ping);
    }
    client.removeAllListeners("notification");
    client.end().catch(() => undefined);
    scheduleRetry();
  };

  async function open(): Promise<void> {
    if (closed) return;
    // Named, so the connection can be told apart in pg_stat_activity.
    const client = new pg.Client({
      connectionString: url,
      keepAlive: true,
      application_name: listenerName(channel),
      connectionTimeoutMillis: answerWithinMs,
    });
    client.on("notification", (message) => {
      if (message.channel === channel && message.payload !== undefined) handlers.onNotification(message.payload);
    });
    client.on("error", (error) => {
      handlers.onError?.(error);
      drop(client);
    });
    client.on("end", () => {
      drop(client);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${client.escapeIdentifier(channel)}`);
    } catch (error) {
      handlers.onError?.(error);
      drop(client);
      return;
    }
    if (isClosed() || dropped.has(client)) {
      await client.end().catch(() => undefined);
      return;
    }
    current = client;
    failures = 0;
    ping = setInterval(() => {
      const unanswered = setTimeout(() => {
        handlers.onError?.(new Error("The listening connection's ping got no answer"));
        drop(client);
      }, answerWithinMs);
      client.query("SELECT 1").then(
        () => {
          clearTimeout(unanswered);
        },
        (error: unknown) => {
          clearTimeout(unanswered);
          handlers.onError?.(error);
          drop(client);
        },
      );
    }, pingMs);
    if (everListened) handlers.onReconnected?.();
    everListened = true;
    markListening();
  }

  void open();
  return {
    listening,
    close: async () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      const client = current;
      current = null;
      if (client !== null) {
        dropped.add(client);
        client.removeAllListeners("notification");
        await client.end().catch(() => undefined);
      }
    },
  };
}
