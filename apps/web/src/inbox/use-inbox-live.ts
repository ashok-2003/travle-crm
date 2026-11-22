"use client";

// The Inbox's live stream (inbox revamp spec, part 1 item 4): one EventSource on /api/live while the Inbox is open. An
// event names a chat and what changed; the events of a moment are gathered, and the list's pages, the counts and each named
// chat's header and messages are loaded again, nothing else. In a hidden tab they are only marked stale, and load when the
// tab is looked at again; the stream stays open there for the alerts. On every reconnect the inbox reads its lists afresh
// (what changed meanwhile was never told); the first time, only what was loaded before the stream was asked for. A stream
// the api refused (signed out, too many tabs) is asked for again a minute later; the minute's poll covers the gap.
import { INBOX_LIVE_EVENT, INBOX_LIVE_PATH, inboxLiveEvent, type InboxLiveEvent } from "@travel-crm/contracts/inbox";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/data/trpc";

/** Events this close together are one load. */
export const GATHER_MS = 300;
/** A refused stream is asked for again after this long. */
export const RETRY_REFUSED_MS = 60_000;

function eventOf(data: unknown): InboxLiveEvent | null {
  try {
    const parsed = inboxLiveEvent.safeParse(JSON.parse(String(data)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `onCustomerWrote` hears each customer's new message, for the alerts. */
export function useInboxLive(onCustomerWrote: (conversationId: string) => void): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const latest = useRef(onCustomerWrote);
  useEffect(() => {
    latest.current = onCustomerWrote;
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let retry: number | undefined;
    let gathering: number | undefined;
    const touched = new Set<string>();

    const refetchType = () => (document.visibilityState === "hidden" ? "none" : "active");
    const load = (queryKey: readonly unknown[], predicate?: (query: Query) => boolean) =>
      void queryClient.invalidateQueries({ queryKey, refetchType: refetchType(), ...(predicate && { predicate }) });

    const loadTouched = () => {
      gathering = undefined;
      load(trpc.inbox.conversations.pathKey());
      load(trpc.salesInbox.summary.pathKey());
      for (const conversationId of touched) {
        load(trpc.inbox.conversation.queryKey({ conversationId }));
        load([...trpc.inbox.messages.pathKey(), conversationId]);
      }
      touched.clear();
    };
    const touch = (conversationId: string) => {
      touched.add(conversationId);
      gathering ??= window.setTimeout(loadTouched, GATHER_MS);
    };

    const open = () => {
      const askedAt = Date.now();
      let connected = false;
      const stream = new EventSource(INBOX_LIVE_PATH);
      source = stream;
      stream.addEventListener("open", () => {
        // A reconnect missed what changed while it was away: every inbox read loads again.
        const before = connected ? Number.POSITIVE_INFINITY : askedAt;
        connected = true;
        const stale = (query: Query) => query.state.dataUpdatedAt < before;
        load(trpc.inbox.pathKey(), stale);
        load(trpc.salesInbox.summary.pathKey(), stale);
      });
      stream.addEventListener(INBOX_LIVE_EVENT, (message) => {
        const event = eventOf(message.data);
        if (event === null) return;
        touch(event.conversationId);
        if (event.direction === "in") latest.current(event.conversationId);
      });
      stream.addEventListener("error", () => {
        // Closed for good (refused, or not a stream): ask again later. Otherwise the browser reconnects by itself.
        if (stream.readyState !== EventSource.CLOSED) return;
        stream.close();
        source = null;
        retry = window.setTimeout(open, RETRY_REFUSED_MS);
      });
    };
    open();
    return () => {
      source?.close();
      window.clearTimeout(retry);
      window.clearTimeout(gathering);
    };
  }, [queryClient, trpc]);
}
