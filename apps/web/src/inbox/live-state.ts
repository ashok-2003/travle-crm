"use client";

// Whether a live stream (use-inbox-live.ts) is open in this tab: while one is, a chat's reads may stay fresh a few seconds
// (an event invalidates them the moment they change), so a chat asked for ahead isn't asked for again as it opens.
import { useSyncExternalStore } from "react";

/** How long a chat's header and messages stay fresh while a stream tells of every change. */
export const LIVE_FRESH_MS = 10_000;

let open = 0;
const watchers = new Set<() => void>();

/** A stream connected (true) or was lost or closed (false). */
export function streamConnected(connected: boolean): void {
  open = Math.max(0, open + (connected ? 1 : -1));
  for (const watcher of watchers) watcher();
}

const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
};

export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}
