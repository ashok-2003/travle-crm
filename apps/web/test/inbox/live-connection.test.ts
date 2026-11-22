// One live stream per browser (inbox revamp spec, part 1 items 4 and 5): of two tabs that want it, one holds the lock and
// the stream and passes its messages to the other; when it closes or stops wanting it, the other takes it over. Each tab
// tells the others which chat is in front of it. Without Web Locks or BroadcastChannel each tab opens its own; a refused
// stream is asked for again a minute later.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveMessage } from "@/inbox/live-bus";
import { createLiveConnection, RETRY_REFUSED_MS, type LiveEnvironment } from "@/inbox/live-connection";

class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static made: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  constructor() {
    super();
    FakeEventSource.made.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  opened() {
    this.readyState = FakeEventSource.OPEN;
    this.dispatchEvent(new Event("open"));
  }
  says(data: object) {
    this.dispatchEvent(new MessageEvent("inbox", { data: JSON.stringify(data) }));
  }
  refused() {
    this.readyState = FakeEventSource.CLOSED;
    this.dispatchEvent(new Event("error"));
  }
}

/** The browser's Web Locks, one holder of a name at a time, the others waiting in turn. */
function fakeLocks() {
  let busy = false;
  const waiting: { run: () => Promise<unknown>; reject: (error: unknown) => void }[] = [];
  const next = () => {
    if (busy) return;
    const turn = waiting.shift();
    if (turn === undefined) return;
    busy = true;
    void turn.run().finally(() => {
      busy = false;
      next();
    });
  };
  return {
    request: (_name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>) =>
      new Promise((resolve, reject) => {
        const turn = { run: () => callback().then(resolve), reject };
        options.signal?.addEventListener("abort", () => {
          const index = waiting.indexOf(turn);
          if (index === -1) return;
          waiting.splice(index, 1);
          reject(new DOMException("Aborted", "AbortError"));
        });
        waiting.push(turn);
        next();
      }),
  } as unknown as LockManager;
}

/** BroadcastChannels of one name: a message reaches every other channel, a moment later. */
function fakeChannels() {
  const open = new Set<EventTarget>();
  return () => {
    const channel = Object.assign(new EventTarget(), {
      postMessage: (data: unknown) => {
        for (const other of open) {
          if (other === channel) continue;
          queueMicrotask(() => other.dispatchEvent(new MessageEvent("message", { data: structuredClone(data) })));
        }
      },
      close: () => {
        open.delete(channel);
      },
    });
    open.add(channel);
    return channel as unknown as BroadcastChannel;
  };
}

/** A tab: its part in the stream, and what it heard (with whether it held the stream). */
function aTab(environment: LiveEnvironment) {
  const heard: { message: LiveMessage; own: boolean }[] = [];
  const connection = createLiveConnection(environment, (message, own) => heard.push({ message, own }));
  return { connection, heard, events: () => heard.filter(({ message }) => message.type === "event") };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const chat = "01900000-0000-7000-8000-00000000000a";

describe("one live stream per browser", () => {
  let environment: LiveEnvironment;
  beforeEach(() => {
    FakeEventSource.made = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    environment = {
      locks: fakeLocks(),
      channel: fakeChannels(),
      openSource: () => new FakeEventSource() as unknown as EventSource,
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens one stream for two tabs, and the other tab hears its messages", async () => {
    const first = aTab(environment);
    const second = aTab(environment);
    first.connection.want(true);
    second.connection.want(true);
    await settle();
    expect(FakeEventSource.made).toHaveLength(1);
    expect(first.connection.holds()).toBe(true);
    expect(second.connection.holds()).toBe(false);
    FakeEventSource.made[0]?.says({ conversationId: chat, change: "message", direction: "in" });
    await settle();
    const event = { conversationId: chat, change: "message", direction: "in" };
    expect(first.events()).toEqual([{ message: { type: "event", event }, own: true }]);
    expect(second.events()).toEqual([{ message: { type: "event", event }, own: false }]);
  });

  it("hands the stream to the other tab when the tab holding it closes, or stops wanting it", async () => {
    const first = aTab(environment);
    const second = aTab(environment);
    const third = aTab(environment);
    first.connection.want(true);
    second.connection.want(true);
    third.connection.want(true);
    await settle();
    first.connection.close();
    await settle();
    expect(FakeEventSource.made).toHaveLength(2);
    expect(FakeEventSource.made[0]?.closed).toBe(true);
    expect(second.connection.holds()).toBe(true);
    second.connection.want(false);
    await settle();
    expect(FakeEventSource.made).toHaveLength(3);
    expect(third.connection.holds()).toBe(true);
    FakeEventSource.made[2]?.says({ conversationId: chat, change: "status" });
    await settle();
    expect(third.events().map(({ own }) => own)).toEqual([true]);
  });

  it("holds none while no tab wants it", async () => {
    aTab(environment);
    aTab(environment);
    await settle();
    expect(FakeEventSource.made).toHaveLength(0);
  });

  it("tells the tab holding the stream which chat is in front of another", async () => {
    const holder = aTab(environment);
    const other = aTab(environment);
    holder.connection.want(true);
    await settle();
    other.connection.tellFront(chat);
    await settle();
    expect(holder.connection.frontElsewhere(chat)).toBe(true);
    other.connection.tellFront(null);
    await settle();
    expect(holder.connection.frontElsewhere(chat)).toBe(false);
  });

  it("without Web Locks, opens a stream in each tab that wants one", async () => {
    const alone = { ...environment, locks: undefined };
    aTab(alone).connection.want(true);
    aTab(alone).connection.want(true);
    await settle();
    expect(FakeEventSource.made).toHaveLength(2);
  });

  it("asks again a minute after the api refused the stream", () => {
    vi.useFakeTimers();
    try {
      const tab = aTab({ ...environment, locks: undefined });
      tab.connection.want(true);
      FakeEventSource.made[0]?.refused();
      expect(FakeEventSource.made[0]?.closed).toBe(true);
      vi.advanceTimersByTime(RETRY_REFUSED_MS);
      expect(FakeEventSource.made).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
