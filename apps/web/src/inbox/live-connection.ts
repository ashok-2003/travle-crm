// One live stream per browser (inbox revamp spec, part 1 items 4 and 5). Of the tabs that want it, one holds the Web Lock
// "inbox-live" and the EventSource; it passes every message on to the other tabs over the BroadcastChannel "inbox-live".
// When that tab closes, or stops wanting it, the next tab waiting for the lock takes it and opens the stream. Each tab says
// over the channel which chat is in front of it, so the tab holding the stream alerts for none of them. Where the browser has
// no Web Locks or no BroadcastChannel, each tab that wants a stream opens its own, as before (the api holds a member to
// five). A stream the api refused (signed out, too many) is asked for again a minute later.
import { INBOX_LIVE_EVENT, INBOX_LIVE_PATH, inboxLiveEvent } from "@travel-crm/contracts/inbox";
import type { LiveMessage } from "./live-bus";

export const LIVE_LOCK = "inbox-live";
export const LIVE_CHANNEL = "inbox-live";
/** A refused stream is asked for again after this long. */
export const RETRY_REFUSED_MS = 60_000;

/** What the browser offers; a test passes its own. */
export interface LiveEnvironment {
  locks: Pick<LockManager, "request"> | undefined;
  channel: (() => BroadcastChannel) | undefined;
  openSource: () => EventSource;
}

export function browserEnvironment(): LiveEnvironment {
  return {
    locks: typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined,
    channel: typeof BroadcastChannel === "undefined" ? undefined : () => new BroadcastChannel(LIVE_CHANNEL),
    openSource: () => new EventSource(INBOX_LIVE_PATH),
  };
}

/** What goes over the channel: the stream's messages, and which chat is in front of which tab. */
type Shared =
  { kind: "live"; message: LiveMessage } | { kind: "front"; tab: string; chat: string | null } | { kind: "front?" };

function sharedOf(data: unknown): Shared | null {
  if (data === null || typeof data !== "object") return null;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "live" || kind === "front" || kind === "front?" ? (data as Shared) : null;
}

function eventOf(data: unknown) {
  try {
    const parsed = inboxLiveEvent.safeParse(JSON.parse(String(data)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * This tab's part in the browser's one stream. `hear` gets every message of the stream, `own` true when this tab holds it
 * (only that tab alerts).
 */
export function createLiveConnection(environment: LiveEnvironment, hear: (message: LiveMessage, own: boolean) => void) {
  const { openSource } = environment;
  const channel = environment.locks === undefined ? undefined : environment.channel?.();
  // Shared between tabs only with both the lock and the channel.
  const locks = channel === undefined ? undefined : environment.locks;
  const shared = locks !== undefined;
  const tab = crypto.randomUUID();
  const fronts = new Map<string, string | null>();
  let myFront: string | null = null;
  let wanted = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let release: (() => void) | null = null;
  let waiting: AbortController | null = null;

  const post = (message: Shared) => {
    channel?.postMessage(message);
  };
  const ownMessage = (message: LiveMessage) => {
    hear(message, true);
    post({ kind: "live", message });
  };

  channel?.addEventListener("message", ({ data }: MessageEvent) => {
    const message = sharedOf(data);
    if (message === null) return;
    if (message.kind === "live") hear(message.message, false);
    else if (message.kind === "front") fronts.set(message.tab, message.chat);
    else post({ kind: "front", tab, chat: myFront });
  });

  function openStream(): void {
    const askedAt = Date.now();
    let everConnected = false;
    const stream = openSource();
    source = stream;
    stream.addEventListener("open", () => {
      ownMessage({ type: "connected", askedAt, reconnect: everConnected });
      everConnected = true;
    });
    stream.addEventListener(INBOX_LIVE_EVENT, (message: MessageEvent) => {
      const event = eventOf(message.data);
      if (event !== null) ownMessage({ type: "event", event });
    });
    stream.addEventListener("error", () => {
      ownMessage({ type: "lost" });
      // Closed for good (refused, or not a stream): ask again later. Otherwise the browser reconnects by itself.
      if (stream.readyState !== EventSource.CLOSED) return;
      stream.close();
      if (source === stream) source = null;
      retry = setTimeout(() => {
        if (wanted && source === null && (!shared || release !== null)) openStream();
      }, RETRY_REFUSED_MS);
    });
  }

  function closeStream(): void {
    clearTimeout(retry);
    if (source !== null) {
      source.close();
      source = null;
      ownMessage({ type: "lost" });
    }
  }

  function lead(): Promise<void> {
    // This tab holds the stream now: the others say which chat is in front of them.
    post({ kind: "front?" });
    openStream();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  }

  function want(next: boolean): void {
    if (next === wanted) return;
    wanted = next;
    if (locks === undefined) {
      if (next) openStream();
      else closeStream();
      return;
    }
    if (next) {
      waiting = new AbortController();
      locks
        .request(LIVE_LOCK, { signal: waiting.signal }, () => {
          waiting = null;
          return lead();
        })
        // Given up while waiting: nothing to do.
        .catch(() => undefined);
      return;
    }
    waiting?.abort();
    waiting = null;
    closeStream();
    release?.();
    release = null;
  }

  return {
    /** Whether this tab wants the stream (an Inbox page, or an alert switched on). */
    want,
    /** Whether this tab holds the stream now. */
    holds: () => source !== null,
    /** The chat in front of this tab now (open, in view and focused), for the tab holding the stream. */
    tellFront(chat: string | null): void {
      if (chat === myFront) return;
      myFront = chat;
      post({ kind: "front", tab, chat });
    },
    /** Whether the chat is in front of another tab of this browser. */
    frontElsewhere: (chat: string) => [...fronts.values()].includes(chat),
    close(): void {
      post({ kind: "front", tab, chat: null });
      want(false);
      channel?.close();
    },
  };
}

export type LiveConnection = ReturnType<typeof createLiveConnection>;
