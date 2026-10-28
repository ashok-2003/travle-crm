"use client";

// The file a member is sending from a chat while it goes up to storage: the chat shows it as a bubble at once, with its picture
// and how far it has got, before the api knows of the message. It lives in memory only (never the tab's storage: it holds a
// file), one per chat, and is let go when the send ends, whichever way.
import { useSyncExternalStore } from "react";

export interface PendingSend {
  file: File;
  caption: string | undefined;
  /** The picture to show for an image, a short-lived object URL; null for any other file. */
  previewUrl: string | null;
  /** 0 to 1. */
  progress: number;
}

const sends = new Map<string, PendingSend>();
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function startPendingSend(conversationId: string, file: File, caption: string | undefined): void {
  const before = sends.get(conversationId)?.previewUrl;
  if (before !== null && before !== undefined) URL.revokeObjectURL(before);
  const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
  sends.set(conversationId, { file, caption, previewUrl, progress: 0 });
  changed();
}

export function progressOfPendingSend(conversationId: string, progress: number): void {
  const now = sends.get(conversationId);
  if (now === undefined) return;
  sends.set(conversationId, { ...now, progress });
  changed();
}

export function endPendingSend(conversationId: string): void {
  const now = sends.get(conversationId);
  if (now === undefined) return;
  if (now.previewUrl !== null) URL.revokeObjectURL(now.previewUrl);
  sends.delete(conversationId);
  changed();
}

/** What this chat is sending now, or null. */
export function usePendingSend(conversationId: string): PendingSend | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => sends.get(conversationId) ?? null,
    () => null,
  );
}
