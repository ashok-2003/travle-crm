// One live stream per browser (inbox revamp spec, part 1 items 4 and 5). Of the tabs that want it, one holds the Web Lock
// "inbox-live" and the EventSource; it passes every message on to the other tabs over the BroadcastChannel "inbox-live".
// When that tab closes, stops wanting it, or is frozen or put in the back-forward cache, the next tab waiting for the lock
// takes it and opens the stream. Each tab says over the channel which chat is in front of it, so the tab holding the stream
// alerts for none of them, and the holder can ask the others to sound the chime when the browser keeps its own tab quiet.
// Messages from the channel are checked, not trusted (another version of the app may share it). Where the browser has no
// Web Locks or no BroadcastChannel, or its lock fails (storage blocked), each tab that wants a stream opens its own, as
// before (the api holds a member to five). A stream the api refused (signed out, too many) is asked for again a minute
// later.
import { INBOX_LIVE_EVENT, INBOX_LIVE_PATH, inboxLiveEvent } from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
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

/** What goes over the channel: the stream's messages, which chat is in front of which tab, and a chime to sound. */
type Shared =
  | { kind: "live"; message: LiveMessage }
  | { kind: "front"; tab: string; chat: string | null }
  | { kind: "front?" }
  | { kind: "chime"; conversationId: string };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
const isChat = (value: unknown): value is string => recordId.safeParse(value).success;

/** A stream's message as another tab passed it on, checked: a change, a connection, or its loss. */
function liveMessageOf(value: unknown): LiveMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === "event") {
    const event = inboxLiveEvent.safeParse(value.event);
    return event.success ? { type: "event", event: event.data } : null;
  }
  if (value.type === "connected" && typeof value.askedAt === "number" && typeof value.reconnect === "boolean") {
    return { type: "connected", askedAt: value.askedAt, reconnect: value.reconnect };
  }
  return value.type === "lost" ? { type: "lost" } : null;
}

/** What another tab sent over the channel, checked, or null for anything else. */
function sharedOf(data: unknown): Shared | null {
  if (!isRecord(data)) return null;
  if (data.kind === "live") {
    const message = liveMessageOf(data.message);
    return message === null ? null : { kind: "live", message };
  }
  if (data.kind === "front" && typeof data.tab === "string" && (data.chat === null || isChat(data.chat))) {
    return { kind: "front", tab: data.tab, chat: data.chat };
  }
  if (data.kind === "chime" && isChat(data.conversationId))
    return { kind: "chime", conversationId: data.conversationId };
  return data.kind === "front?" ? { kind: "front?" } : null;
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
 * (only that tab decides the alerts); `chime` is asked of this tab by the one holding the stream.
 */
export function createLiveConnection(
  environment: LiveEnvironment,
  hear: (message: LiveMessage, own: boolean) => void,
  { chime = () => undefined }: { chime?: (conversationId: string) => void } = {},
) {
  const { openSource } = environment;
  const channel = environment.locks === undefined ? undefined : environment.channel?.();
  // Shared between tabs only with both the lock and the channel, and while the lock works.
  const locks = channel === undefined ? undefined : environment.locks;
  let lockFailed = false;
  const tab = crypto.randomUUID();
  const fronts = new Map<string, string | null>();
  let myFront: string | null = null;
  let desired = false;
  let paused = false;
  let active = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let release: (() => void) | null = null;
  let waiting: AbortController | null = null;
  /** Each lock request's number: a callback for an older one (given up since) releases at once. */
  let request = 0;

  const post = (message: Shared) => {
    channel?.postMessage(message);
  };
  const ownMessage = (message: LiveMessage) => {
    hear(message, true);
    // Passed on only by the tab holding the lock: a tab on a stream of its own keeps it to itself.
    if (release !== null) post({ kind: "live", message });
  };

  channel?.addEventListener("message", ({ data }: MessageEvent) => {
    const message = sharedOf(data);
    if (message === null) return;
    if (message.kind === "live") hear(message.message, false);
    else if (message.kind === "front") fronts.set(message.tab, message.chat);
    else if (message.kind === "chime") chime(message.conversationId);
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
        if (active && source === null && (sharedLock() === undefined || release !== null)) openStream();
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

  /** The lock shared with the other tabs, unless there is none here or it failed. */
  const sharedLock = () => (lockFailed ? undefined : locks);

  function lead(): Promise<void> {
    // This tab holds the stream now: the others say which chat is in front of them.
    post({ kind: "front?" });
    openStream();
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  }

  function start(): void {
    const lock = sharedLock();
    if (lock === undefined) {
      openStream();
      return;
    }
    request += 1;
    const mine = request;
    const controller = new AbortController();
    waiting = controller;
    lock
      .request(LIVE_LOCK, { signal: controller.signal }, () => {
        // Granted after it was given up, or for a request since replaced: let it go at once.
        if (mine !== request || !active) return Promise.resolve();
        waiting = null;
        return lead();
      })
      .catch((error: unknown) => {
        // Given up while waiting: nothing to do. Any other failure (storage blocked): this tab's own stream.
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (mine !== request || !active) return;
        lockFailed = true;
        waiting = null;
        openStream();
      });
  }

  function stop(): void {
    request += 1;
    waiting?.abort();
    waiting = null;
    closeStream();
    release?.();
    release = null;
  }

  /** Opens or lets go of the stream as the tab now wants it and isn't frozen. */
  function apply(): void {
    const next = desired && !paused;
    if (next === active) return;
    active = next;
    if (next) start();
    else stop();
  }

  return {
    /** Whether this tab wants the stream (an Inbox page, or an alert switched on). */
    want(next: boolean): void {
      desired = next;
      apply();
    },
    /** Frozen or put in the back-forward cache (true), or back (false): a frozen tab lets the others hold the stream. */
    pause(next: boolean): void {
      paused = next;
      apply();
    },
    /** Whether this tab holds the stream now. */
    holds: () => source !== null,
    /** Asks the other tabs to sound the chime (one of them will, once), when this one may not. */
    askChime(conversationId: string): void {
      post({ kind: "chime", conversationId });
    },
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
      desired = false;
      apply();
      channel?.close();
    },
  };
}

export type LiveConnection = ReturnType<typeof createLiveConnection>;
