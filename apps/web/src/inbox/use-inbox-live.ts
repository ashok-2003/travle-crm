"use client";

// The Inbox, or a lead's page with its chat, on the live stream (inbox revamp spec, part 1 item 4). It says it is on screen
// (so the app's shell keeps a stream open for this browser whatever the alert switches say, inbox-live-shell.tsx) with the
// chat in front of it, and loads again, lightly, what each change touches (live-refresh.ts). On every reconnect it reads
// again its list's first page, the counts and the open chat (what changed meanwhile was never told); on the stream's first
// connection, only what was loaded before it was asked for.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { hearLive, useLiveConsumer } from "./live-bus";
import { createLiveRefresh } from "./live-refresh";

/** `openId` is the chat in front of the member here, if any. */
export function useInboxLive({ openId }: { openId: string | null }): void {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  useLiveConsumer(openId);
  const open = useRef(openId);
  useEffect(() => {
    open.current = openId;
  });

  useEffect(() => {
    const refresh = createLiveRefresh({ queryClient, trpc, client, openId: () => open.current });
    const stop = hearLive((message) => {
      if (message.type === "event") refresh.touched(message.event);
      // A reconnect missed what changed while it was away.
      else if (message.type === "connected") {
        refresh.connected(message.reconnect ? Number.POSITIVE_INFINITY : message.askedAt);
      }
    });
    return () => {
      stop();
      refresh.stop();
    };
  }, [client, queryClient, trpc]);
}
