"use client";

// Whether this tab hears a live stream (its own, or another tab's passed on; inbox-live-shell.tsx): while it does, a chat's
// reads may stay fresh a few seconds (an event invalidates them the moment they change), so a chat asked for ahead isn't
// asked for again as it opens.
import { useSyncExternalStore } from "react";

/** How long a chat's header and messages stay fresh while a stream tells of every change. */
export const LIVE_FRESH_MS = 10_000;

let open = false;
const watchers = new Set<() => void>();

/** The stream connected (true) or was lost or closed (false). */
export function streamConnected(connected: boolean): void {
  if (open === connected) return;
  open = connected;
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
    () => open,
    () => false,
  );
}
