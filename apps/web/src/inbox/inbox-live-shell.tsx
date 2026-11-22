"use client";

// The app's live stream (inbox revamp spec, part 1 items 4 and 5), in the agency app's shell (never the console), for a
// member who may read the inbox. This browser holds one stream (live-connection.ts) while an Inbox page or a lead's chat is
// on screen in one of its tabs, or the member turned the sound or desktop notifications on; with both off and no Inbox
// page open, none. Every tab hears the stream's messages and passes them to the parts on screen (live-bus.ts). Only the tab
// holding the stream alerts, for a customer's message in a chat of the member's that isn't in front of them in any tab.
// Outside the Inbox a change does only that, and loads again the menu's Inbox count, at most once every COUNT_EVERY_MS.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useAnyAlertOn } from "./inbox-alerts";
import { tellLive, useLiveConsumers } from "./live-bus";
import { browserEnvironment, createLiveConnection, type LiveConnection } from "./live-connection";
import { throttle } from "./live-refresh";
import { streamConnected } from "./live-state";
import { useInboxAlerts } from "./use-inbox-alerts";

/** Outside the Inbox, the menu's count loads at most this often while chats change. */
export const COUNT_EVERY_MS = 10_000;

/** Whether this tab is the one the member is looking at. */
const looking = () => document.visibilityState === "visible" && document.hasFocus();

function MemberLive() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const shown = useLiveConsumers();
  const alertsOn = useAnyAlertOn();
  const wanted = shown.length > 0 || alertsOn;
  const connection = useRef<LiveConnection | null>(null);
  const latest = useRef({ shown, wanted });
  useEffect(() => {
    latest.current = { shown, wanted };
  });
  const alert = useInboxAlerts(
    (chat) => (looking() && latest.current.shown.includes(chat)) || (connection.current?.frontElsewhere(chat) ?? false),
  );
  const latestAlert = useRef(alert);
  useEffect(() => {
    latestAlert.current = alert;
  });

  useEffect(() => {
    const count = throttle(async () => {
      const refetchType = document.visibilityState === "hidden" ? "none" : "active";
      await queryClient.invalidateQueries(
        { queryKey: trpc.salesInbox.summary.pathKey(), refetchType },
        { cancelRefetch: false },
      );
      return true;
    }, COUNT_EVERY_MS);
    const live = createLiveConnection(browserEnvironment(), (message, own) => {
      tellLive(message);
      if (message.type !== "event") {
        streamConnected(message.type === "connected");
        return;
      }
      if (own && message.event.direction === "in") latestAlert.current(message.event.conversationId);
      // Outside the Inbox: the count, and nothing else.
      if (latest.current.shown.length === 0) count.ask();
    });
    connection.current = live;
    live.want(latest.current.wanted);
    return () => {
      connection.current = null;
      live.close();
      count.stop();
      streamConnected(false);
    };
  }, [queryClient, trpc]);

  useEffect(() => {
    connection.current?.want(wanted);
  }, [wanted]);

  // The other tabs learn which chat is in front of this one, so the tab holding the stream doesn't alert for it.
  useEffect(() => {
    const tell = () => {
      connection.current?.tellFront(looking() ? (shown.find((chat) => chat !== null) ?? null) : null);
    };
    tell();
    window.addEventListener("focus", tell);
    window.addEventListener("blur", tell);
    document.addEventListener("visibilitychange", tell);
    return () => {
      window.removeEventListener("focus", tell);
      window.removeEventListener("blur", tell);
      document.removeEventListener("visibilitychange", tell);
    };
  }, [shown]);

  return null;
}

export function InboxLiveShell() {
  return useHolds("inbox:view") ? <MemberLive /> : null;
}
