// The Inbox's live stream in the browser (inbox revamp spec, part 1 item 4), kept light: a burst of changes (a reply's
// queued, sent, delivered and read; a broadcast's delivery reports) makes a bounded number of requests: the list (its first
// page alone) and the counts at most once every 3 s, the open chat a moment after it changes, typing only its bar, other
// chats nothing until opened. A reconnect reads the list's first page, the counts and the open chat; a hidden tab loads
// nothing; a customer's message is passed on for the alerts; a refused stream is asked for again a minute later.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withFirstPage } from "@/inbox/first-page";
import { GATHER_MS, LISTS_EVERY_MS, throttle } from "@/inbox/live-refresh";
import { useConversation, useConversations, useMessages } from "@/inbox/use-inbox";
import { RETRY_REFUSED_MS, useInboxLive } from "@/inbox/use-inbox-live";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { newQueryClient, withApp } from "../organization/api";
import { aMessage, answerApi } from "./answer-api";

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
  dropped() {
    this.readyState = FakeEventSource.CONNECTING;
    this.dispatchEvent(new Event("error"));
  }
  refused() {
    this.readyState = FakeEventSource.CLOSED;
    this.dispatchEvent(new Event("error"));
  }
}

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const open = id(1);
const header = {
  id: open,
  phone: "+919876543210",
  name: "Meera Rao",
  personId: null,
  lead: null,
  pastCustomer: false,
  liveLead: null,
  windowOpenUntil: null,
  lastInboundAt: null,
  needsReply: false,
  trip: { destination: null, travelMonth: null },
  optedOut: false,
  agreed: true,
  state: "open",
  tags: [],
  pinned: false,
  archived: false,
  snoozedUntil: null,
  replying: [],
};
const row = (n: number) => ({
  id: id(n),
  phone: "+919876543210",
  name: `Customer ${String(n)}`,
  personId: null,
  preview: "Hello",
  lastMessageAt: "2026-10-26T10:00:00.000Z",
  needsReply: false,
  isNewNumber: false,
  lastDirection: "in",
  lastStatus: null,
  lead: null,
  tags: [],
  pinned: false,
  archived: false,
  unread: 0,
  waitingSince: null,
  snoozedUntil: null,
});
const summary = {
  waiting: 0,
  late: 0,
  unread: 0,
  mine: 0,
  unassigned: 0,
  snoozed: 0,
  stages: { new: 0, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
};
const listInput = { filter: "all" as const, search: "", tagId: null, stage: null, period: null };

/** The Inbox with a chat open, as the live stream sees it: the list, the counts, and the open chat's bar and messages. */
function inbox() {
  const api = answerApi({
    "inbox.conversations": (input: unknown) => {
      const before = (input as { before?: string }).before;
      return before === undefined
        ? { items: [row(1), row(2)], nextCursor: id(2) }
        : { items: [row(3), row(4)], nextCursor: null };
    },
    "salesInbox.summary": summary,
    "inbox.conversation": header,
    "inbox.messages": { items: [aMessage({ id: id(90) })], nextCursor: null, people: {}, unread: null },
    "salesInbox.notes": { items: [], people: {} },
  });
  const queryClient = newQueryClient();
  const view = renderHook(
    () => {
      const list = useConversations(listInput);
      useInboxSummary();
      useConversation(open);
      useMessages(open, true);
      useInboxLive({ openId: open });
      return list;
    },
    { wrapper: withApp(queryClient) },
  );
  const source = FakeEventSource.made.at(-1);
  if (source === undefined) throw new Error("no stream was opened");
  const count = () => ({
    list: api.of("inbox.conversations").length,
    counts: api.of("salesInbox.summary").length,
    bar: api.of("inbox.conversation").length,
    messages: api.of("inbox.messages").length,
    other: api.calls.filter(
      (call) =>
        !["inbox.conversations", "salesInbox.summary", "inbox.conversation", "inbox.messages"].includes(call.path),
    ).length,
  });
  return { api, queryClient, view, source, count };
}

/** Lets the timers and the answers run, a slice at a time. */
async function pass(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("the Inbox's live stream", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    FakeEventSource.made = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("makes few requests for a reply's burst and a broadcast's reports: the list every 3 s, the open chat as it changes", async () => {
    const { source, count } = inbox();
    await pass(100);
    act(() => {
      source.opened();
    });
    await pass(1_000);
    const before = count();
    // A reply: queued, sending, sent, the chat answered, delivered, read; a teammate typing; and meanwhile a broadcast's
    // 60 delivery reports in other chats.
    const reply = ["message", "status", "status", "chat", "status", "status", "typing", "typing"] as const;
    for (const [index, change] of reply.entries()) {
      act(() => {
        source.says({ conversationId: open, change });
        for (let report = 0; report < 8; report += 1)
          source.says({ conversationId: id(100 + index * 8 + report), change: "status" });
      });
      await pass(250);
    }
    await pass(10_000);
    const after = count();
    // 72 events in 2 s: the list and the counts twice, the open chat's bar and messages 3 times each.
    expect(after.list - before.list).toBe(2);
    expect(after.counts - before.counts).toBe(2);
    expect(after.messages - before.messages).toBeGreaterThanOrEqual(1);
    expect(after.messages - before.messages).toBeLessThanOrEqual(4);
    expect(after.bar - before.bar).toBeGreaterThanOrEqual(1);
    expect(after.bar - before.bar).toBeLessThanOrEqual(4);
    // Notes, sent-later messages and the AI's state are loaded only for the chat in front, and nothing else is asked.
    expect(after.other - before.other).toBeLessThanOrEqual(2);
  });

  it("loads the list again by its first page alone, keeping the pages loaded below it", async () => {
    const { source, count, view } = inbox();
    await pass(100);
    const more = view.result.current.fetchNextPage();
    await pass(100);
    await act(async () => {
      await more;
    });
    expect(view.result.current.items?.map((item) => item.id)).toEqual([id(1), id(2), id(3), id(4)]);
    const before = count();
    act(() => {
      source.says({ conversationId: id(3), change: "message", direction: "in" });
    });
    await pass(GATHER_MS + 100);
    expect(count().list - before.list).toBe(1);
    expect(view.result.current.items?.map((item) => item.id)).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it("gives typing to the open chat's bar alone, and only marks a chat that isn't open", async () => {
    const { source, count, queryClient } = inbox();
    await pass(100);
    const before = count();
    act(() => {
      source.says({ conversationId: open, change: "typing" });
      source.says({ conversationId: id(5), change: "message" });
    });
    await pass(GATHER_MS + 100);
    const after = count();
    expect(after.bar - before.bar).toBe(1);
    expect(after.messages - before.messages).toBe(0);
    expect(after.list - before.list).toBe(1);
    // The other chat isn't asked for; were it in the cache, it is stale now.
    expect(queryClient.getQueryCache().findAll({ queryKey: [["inbox", "conversation"]] })).toHaveLength(1);
  });

  it("on a reconnect reads the list's first page, the counts and the open chat, and nothing else", async () => {
    const { source, count } = inbox();
    await pass(100);
    act(() => {
      source.opened();
    });
    await pass(1_000);
    const before = count();
    act(() => {
      source.dropped();
    });
    await pass(5_000);
    act(() => {
      source.opened();
    });
    await pass(LISTS_EVERY_MS);
    const after = count();
    expect(after.list - before.list).toBe(1);
    expect(after.counts - before.counts).toBe(1);
    expect(after.bar - before.bar).toBe(1);
    expect(after.messages - before.messages).toBe(1);
    expect(after.other).toBe(before.other);
  });

  it("loads nothing in a hidden tab", async () => {
    const { source, count } = inbox();
    await pass(100);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const before = count();
    act(() => {
      source.says({ conversationId: open, change: "message", direction: "in" });
    });
    await pass(LISTS_EVERY_MS);
    expect(count()).toEqual(before);
  });

  it("passes on a customer's message, for the alerts", () => {
    answerApi({});
    const customerWrote = vi.fn();
    renderHook(
      () => {
        useInboxLive({ openId: null, onCustomerWrote: customerWrote });
      },
      { wrapper: withApp(newQueryClient()) },
    );
    const source = FakeEventSource.made.at(-1);
    act(() => {
      source?.says({ conversationId: open, change: "message", direction: "in" });
      source?.says({ conversationId: open, change: "status" });
      source?.says({ conversationId: "not an id", change: "message", direction: "in" });
    });
    expect(customerWrote.mock.calls).toEqual([[open]]);
  });

  it("asks again a minute after the api refused the stream", () => {
    answerApi({});
    renderHook(
      () => {
        useInboxLive({ openId: null });
      },
      { wrapper: withApp(newQueryClient()) },
    );
    const source = FakeEventSource.made.at(-1);
    act(() => {
      source?.refused();
    });
    expect(source?.closed).toBe(true);
    expect(FakeEventSource.made).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(RETRY_REFUSED_MS);
    });
    expect(FakeEventSource.made).toHaveLength(2);
  });
});

describe("the throttle under the live loads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once more after a run that was asked for again, or found a load already out, never two at once", async () => {
    let runs = 0;
    let busyOnce = true;
    let release: () => void = () => undefined;
    const work = vi.fn(async () => {
      runs += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = !busyOnce;
      busyOnce = false;
      return done;
    });
    const { ask } = throttle(work, 1_000);
    ask();
    ask();
    await vi.advanceTimersByTimeAsync(GATHER_MS);
    expect(runs).toBe(1);
    ask();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runs).toBe(2);
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(2);
  });
});

describe("a list's first page in place", () => {
  it("takes the first page's items, keeps the pages below without them, and the people it names", () => {
    interface Page {
      items: { id: string }[];
      nextCursor: string | null;
      people: Record<string, string>;
    }
    const data: { pages: Page[]; pageParams: (string | null)[] } = {
      pages: [
        { items: [{ id: "a" }, { id: "b" }], nextCursor: "b", people: { u1: "Asha" } },
        { items: [{ id: "c" }, { id: "d" }], nextCursor: null, people: {} },
      ],
      pageParams: [null, "b"],
    };
    const first: Page = { items: [{ id: "c" }, { id: "a" }], nextCursor: "a", people: { u2: "Ravi" } };
    expect(withFirstPage(data, first)).toEqual({
      pages: [
        { items: [{ id: "c" }, { id: "a" }, { id: "b" }], nextCursor: "b", people: { u1: "Asha", u2: "Ravi" } },
        { items: [{ id: "d" }], nextCursor: null, people: {} },
      ],
      pageParams: [null, "b"],
    });
    expect(withFirstPage({ pages: [data.pages[0] ?? first], pageParams: [null] }, first)).toEqual({
      pages: [first],
      pageParams: [null],
    });
  });
});
