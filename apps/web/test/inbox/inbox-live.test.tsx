// The Inbox's live stream in the browser (inbox revamp spec, part 1 item 4): on connecting it reads again what was loaded
// before it asked, and on every reconnect everything; the events of a moment are one load of the list, the counts and each
// named chat (only those); a hidden tab only marks them stale; a customer's message is passed on for the alerts; a stream
// the api refused is asked for again a minute later.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATHER_MS, RETRY_REFUSED_MS, useInboxLive } from "@/inbox/use-inbox-live";
import { newQueryClient, withApp } from "../organization/api";

class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static made: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  constructor(readonly url: string) {
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

const chatA = "01900000-0000-7000-8000-00000000000a";
const chatB = "01900000-0000-7000-8000-00000000000b";

function setUp() {
  const queryClient = newQueryClient();
  const invalidated = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  const customerWrote = vi.fn();
  renderHook(
    () => {
      useInboxLive(customerWrote);
    },
    { wrapper: withApp(queryClient) },
  );
  const source = FakeEventSource.made.at(-1);
  if (source === undefined) throw new Error("no stream was opened");
  const keys = () => invalidated.mock.calls.map(([filters]) => filters?.queryKey);
  return { source, invalidated, keys, customerWrote };
}

describe("the Inbox's live stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.made = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens /api/live and, once connected, reads again what was loaded before it asked", () => {
    const { source, invalidated, keys } = setUp();
    expect(source.url).toBe("/api/live");
    act(() => {
      source.opened();
    });
    expect(keys()).toEqual([[["inbox"]], [["salesInbox", "summary"]]]);
    const stale = invalidated.mock.calls[0]?.[0]?.predicate;
    expect(stale?.({ state: { dataUpdatedAt: 0 } } as never)).toBe(true);
    expect(stale?.({ state: { dataUpdatedAt: Date.now() + 1 } } as never)).toBe(false);
    // A reconnect missed what changed meanwhile: everything.
    invalidated.mockClear();
    act(() => {
      source.opened();
    });
    expect(invalidated.mock.calls[0]?.[0]?.predicate?.({ state: { dataUpdatedAt: Date.now() + 1 } } as never)).toBe(
      true,
    );
  });

  it("loads the list, the counts and each named chat once for the events of a moment, and passes on a customer's", () => {
    const { source, invalidated, keys, customerWrote } = setUp();
    act(() => {
      source.says({ conversationId: chatA, change: "message", direction: "in" });
      source.says({ conversationId: chatA, change: "chat" });
      source.says({ conversationId: chatB, change: "status" });
      source.says({ conversationId: "not an id", change: "message" });
    });
    expect(invalidated).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(GATHER_MS);
    });
    expect(keys()).toEqual([
      [["inbox", "conversations"]],
      [["salesInbox", "summary"]],
      [["inbox", "conversation"], { input: { conversationId: chatA }, type: "query" }],
      [["inbox", "messages"], chatA],
      [["inbox", "conversation"], { input: { conversationId: chatB }, type: "query" }],
      [["inbox", "messages"], chatB],
    ]);
    expect(invalidated.mock.calls.every(([filters]) => filters?.refetchType === "active")).toBe(true);
    expect(customerWrote.mock.calls).toEqual([[chatA]]);
  });

  it("only marks them stale in a hidden tab, which loads them as it is looked at again", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { source, invalidated } = setUp();
    act(() => {
      source.says({ conversationId: chatA, change: "message" });
      vi.advanceTimersByTime(GATHER_MS);
    });
    expect(invalidated.mock.calls.every(([filters]) => filters?.refetchType === "none")).toBe(true);
  });

  it("asks again a minute after the api refused the stream", () => {
    const { source } = setUp();
    act(() => {
      source.refused();
    });
    expect(source.closed).toBe(true);
    expect(FakeEventSource.made).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(RETRY_REFUSED_MS);
    });
    expect(FakeEventSource.made).toHaveLength(2);
  });
});
