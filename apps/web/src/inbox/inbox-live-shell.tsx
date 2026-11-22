"use client";

// The app's live stream (inbox revamp spec, part 1 items 4 and 5), in the agency app's shell (never the console), for a
// member who may read the inbox. This browser holds one stream (live-connection.ts) while an Inbox page or a lead's chat is
// on screen in one of its tabs, or the member turned the sound or desktop notifications on; with both off and no Inbox
// page open, none. Every tab hears the stream's messages and passes them to the parts on screen (live-bus.ts). Only the tab
// holding the stream decides the alerts, for a customer's message in a chat of the member's that isn't in front of them in
// any tab; it sounds the chime itself if the browser lets it, else asks the other tabs, and the first that may sound does
// (a tab sounds once someone has clicked in it: the first click on a page readies its audio). Outside the Inbox a change
// does only that, and loads again the menu's Inbox count, at most once every COUNT_EVERY_MS. A tab frozen or put in the
// back-forward cache lets another hold the stream until it is back.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/data/trpc";
import { useHolds, useMe } from "@/session/me-context";
import { claimChime, playChime, readySound, soundReady, useAnyAlertOn, useSoundOn } from "./inbox-alerts";
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
  const userId = useMe().user.id;
  const shown = useLiveConsumers();
  const alertsOn = useAnyAlertOn(userId);
  const soundOn = useSoundOn(userId);
  const wanted = shown.length > 0 || alertsOn;
  const connection = useRef<LiveConnection | null>(null);
  const latest = useRef({ shown, wanted });
  useEffect(() => {
    latest.current = { shown, wanted };
  });
  const alert = useInboxAlerts(
    (chat) => (looking() && latest.current.shown.includes(chat)) || (connection.current?.frontElsewhere(chat) ?? false),
    // This tab sounds if the browser lets it; else a tab it lets.
    (chat) => {
      if (!playChime()) connection.current?.askChime(chat);
    },
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
    const live = createLiveConnection(
      browserEnvironment(),
      (message, own) => {
        tellLive(message);
        if (message.type !== "event") {
          streamConnected(message.type === "connected");
          return;
        }
        if (own && message.event.direction === "in") latestAlert.current(message.event.conversationId);
        // Outside the Inbox: the count, and nothing else.
        if (latest.current.shown.length === 0) count.ask();
      },
      {
        // Asked by the tab holding the stream: the first tab that may sound takes it, once.
        chime: (chat) => {
          if (soundReady() && claimChime(chat)) playChime();
        },
      },
    );
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

  // A frozen tab, or one put in the back-forward cache, lets the others hold the stream until it is back.
  useEffect(() => {
    const freeze = () => connection.current?.pause(true);
    const resume = () => connection.current?.pause(false);
    const hidden = (event: PageTransitionEvent) => {
      if (event.persisted) freeze();
    };
    const shownAgain = (event: PageTransitionEvent) => {
      if (event.persisted) resume();
    };
    document.addEventListener("freeze", freeze);
    document.addEventListener("resume", resume);
    window.addEventListener("pagehide", hidden);
    window.addEventListener("pageshow", shownAgain);
    return () => {
      document.removeEventListener("freeze", freeze);
      document.removeEventListener("resume", resume);
      window.removeEventListener("pagehide", hidden);
      window.removeEventListener("pageshow", shownAgain);
    };
  }, []);

  // With the sound on, the first click or key on a page readies its audio, so this tab may sound later.
  useEffect(() => {
    if (!soundOn) return;
    const ready = () => {
      readySound();
    };
    window.addEventListener("pointerdown", ready, { capture: true, once: true });
    window.addEventListener("keydown", ready, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", ready, { capture: true });
      window.removeEventListener("keydown", ready, { capture: true });
    };
  }, [soundOn]);

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
