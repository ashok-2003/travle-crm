"use client";

// The Inbox's live stream (inbox revamp spec, part 1 item 4): one EventSource on /api/live while the Inbox is open, or a
// lead's page with its chat. An event names a chat and what changed in it; live-refresh.ts loads again what it touches,
// lightly. The stream stays open in a hidden tab, for the alerts. On every reconnect the inbox reads again its list's first
// page, the counts and the open chat (what changed meanwhile was never told); the first time, only what was loaded before
// the stream was asked for. A stream the api refused (signed out, too many tabs) is asked for again a minute later; the
// minute's poll covers the gap. Each stream's own wait before reconnecting comes from the api (3 to 10 s).
import { INBOX_LIVE_EVENT, INBOX_LIVE_PATH, inboxLiveEvent, type InboxLiveEvent } from "@travel-crm/contracts/inbox";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { createLiveRefresh } from "./live-refresh";
import { streamConnected } from "./live-state";

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

/**
 * `openId` is the chat in front of the member; `onCustomerWrote` hears each customer's new message, for the alerts (the
 * Inbox's own; a lead's page has none).
 */
export function useInboxLive({
  openId,
  onCustomerWrote,
}: {
  openId: string | null;
  onCustomerWrote?: (conversationId: string) => void;
}): void {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const latest = useRef({ openId, onCustomerWrote });
  useEffect(() => {
    latest.current = { openId, onCustomerWrote };
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const refresh = createLiveRefresh({ queryClient, trpc, client, openId: () => latest.current.openId });
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    const lost = () => {
      if (connected) streamConnected(false);
      connected = false;
    };

    const open = () => {
      const askedAt = Date.now();
      let everConnected = false;
      const stream = new EventSource(INBOX_LIVE_PATH);
      source = stream;
      stream.addEventListener("open", () => {
        // A reconnect missed what changed while it was away.
        refresh.connected(everConnected ? Number.POSITIVE_INFINITY : askedAt);
        everConnected = true;
        if (!connected) streamConnected(true);
        connected = true;
      });
      stream.addEventListener(INBOX_LIVE_EVENT, (message) => {
        const event = eventOf(message.data);
        if (event === null) return;
        refresh.touched(event);
        if (event.direction === "in") latest.current.onCustomerWrote?.(event.conversationId);
      });
      stream.addEventListener("error", () => {
        lost();
        // Closed for good (refused, or not a stream): ask again later. Otherwise the browser reconnects by itself.
        if (stream.readyState !== EventSource.CLOSED) return;
        stream.close();
        source = null;
        retry = setTimeout(open, RETRY_REFUSED_MS);
      });
    };
    open();
    return () => {
      source?.close();
      clearTimeout(retry);
      refresh.stop();
      lost();
    };
  }, [client, queryClient, trpc]);
}
