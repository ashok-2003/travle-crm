"use client";

// What a tab hears of the live stream, wherever the stream is held (inbox-live-shell.tsx: this tab's own, or another tab's
// passed on over a BroadcastChannel), and who in the tab wants it: the Inbox and a lead's chat say they are on screen, with
// the chat in front of them, so the shell keeps a stream open for them whatever the alert switches say.
import type { InboxLiveEvent } from "@travel-crm/contracts/inbox";
import { useEffect, useSyncExternalStore } from "react";

/** What the stream says: a change, that it is (re)connected (since `askedAt`, or a reconnect), or that it was lost. */
export type LiveMessage =
  | { type: "event"; event: InboxLiveEvent }
  | { type: "connected"; askedAt: number; reconnect: boolean }
  | { type: "lost" };

type Listener = (message: LiveMessage) => void;
const listeners = new Set<Listener>();

/** Hears every message of the stream in this tab; returns the way to stop. */
export function hearLive(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Passes a message of the stream to everything in this tab that hears it. */
export function tellLive(message: LiveMessage): void {
  for (const listener of listeners) listener(message);
}

/** The parts on screen that want the stream, each with the chat in front of it (or none). */
const consumers = new Map<symbol, string | null>();
const watchers = new Set<() => void>();
let snapshot: readonly (string | null)[] = [];

function changed(): void {
  snapshot = [...consumers.values()];
  for (const watcher of watchers) watcher();
}

/** Says, while the caller is on screen, that it wants the stream, and which chat it shows. */
export function useLiveConsumer(openId: string | null): void {
  useEffect(() => {
    const key = Symbol("live consumer");
    consumers.set(key, openId);
    changed();
    return () => {
      consumers.delete(key);
      changed();
    };
  }, [openId]);
}

const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
};

/** The chats shown by the parts that want the stream (an entry each; null for none): empty when none is on screen. */
export function useLiveConsumers(): readonly (string | null)[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
