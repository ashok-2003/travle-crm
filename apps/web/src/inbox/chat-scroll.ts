"use client";

// How a chat scrolls, as WhatsApp's does: it opens at the newest message and stays there while new ones arrive; a new message
// scrolls into view only when the person was already at the bottom (or sent it), else `unseen` says there are new messages
// below; older messages are asked for as the top is reached, and the view does not jump when they are added above. Pictures
// that load later change the height, so a view at the bottom stays there.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** How near the bottom still counts as "at the bottom". */
const NEAR_BOTTOM_PX = 80;
/** How near the top asks for the earlier messages. */
const NEAR_TOP_PX = 120;

export interface ChatScrollInput {
  /** Oldest and newest message ids as shown, and whether the newest is ours (we sent it just now). */
  oldestId: string | null;
  newestId: string | null;
  newestIsOurs: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  loadEarlier: () => void;
}

const viewportOf = (root: HTMLElement | null) =>
  root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

export function useChatScroll(input: ChatScrollInput) {
  const { oldestId, newestId, newestIsOurs, hasEarlier, loadingEarlier, loadEarlier } = input;
  /** Put on the scroll area's root: its viewport is found inside. */
  const root = useRef<HTMLDivElement>(null);
  const [unseen, setUnseen] = useState(false);
  const atBottom = useRef(true);
  const seen = useRef<{ oldest: string | null; newest: string | null; height: number }>({
    oldest: null,
    newest: null,
    height: 0,
  });
  const latest = useRef({ hasEarlier, loadingEarlier, loadEarlier });
  useEffect(() => {
    latest.current = { hasEarlier, loadingEarlier, loadEarlier };
  });

  const toBottom = useCallback(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    viewport.scrollTop = viewport.scrollHeight;
    atBottom.current = true;
    setUnseen(false);
  }, []);

  // What changed in the list decides where the view goes.
  useLayoutEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null || newestId === null) return;
    const before = seen.current;
    if (before.newest === null) {
      viewport.scrollTop = viewport.scrollHeight;
      atBottom.current = true;
    } else if (before.newest !== newestId) {
      if (atBottom.current || newestIsOurs) {
        viewport.scrollTop = viewport.scrollHeight;
        atBottom.current = true;
        setUnseen(false);
      } else {
        setUnseen(true);
      }
    } else if (before.oldest !== oldestId) {
      // Earlier messages were added above: keep what the person was reading where it was.
      viewport.scrollTop += viewport.scrollHeight - before.height;
    }
    seen.current = { oldest: oldestId, newest: newestId, height: viewport.scrollHeight };
  }, [oldestId, newestId, newestIsOurs]);

  // Scrolling, and the content growing (a picture arriving).
  useEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    const onScroll = () => {
      atBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < NEAR_BOTTOM_PX;
      if (atBottom.current) setUnseen(false);
      seen.current.height = viewport.scrollHeight;
      const { hasEarlier: more, loadingEarlier: busy, loadEarlier: load } = latest.current;
      if (viewport.scrollTop < NEAR_TOP_PX && more && !busy) load();
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const content = viewport.firstElementChild;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) viewport.scrollTop = viewport.scrollHeight;
      seen.current.height = viewport.scrollHeight;
    });
    if (content !== null) observer.observe(content);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return { root, unseen, toBottom };
}
