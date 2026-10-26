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
  /** How many messages are shown: how many came in while the person was reading higher up. */
  total: number;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  loadEarlier: () => void;
}

/**
 * Scrolls to the very end and says where that left the view. The scroll event this causes arrives a frame later, when a picture
 * may already have grown the content: read then, the view would look "away from the bottom" though nobody moved it, so the
 * event for this very position is not taken as the person's own scroll.
 */
function pinToEnd(viewport: HTMLElement): number {
  viewport.scrollTop = viewport.scrollHeight;
  return viewport.scrollTop;
}

const viewportOf = (root: HTMLElement | null) =>
  root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

export function useChatScroll(input: ChatScrollInput) {
  const { oldestId, newestId, newestIsOurs, total, hasEarlier, loadingEarlier, loadEarlier } = input;
  /** Put on the scroll area's root: its viewport is found inside. */
  const root = useRef<HTMLDivElement>(null);
  const [unseen, setUnseen] = useState(false);
  /** How many arrived below while the person was higher up, and whether they are higher up at all. */
  const [unseenCount, setUnseenCount] = useState(0);
  const [away, setAway] = useState(false);
  const atBottom = useRef(true);
  /** The position this hook last scrolled to itself, whose scroll event is not the person's. */
  const ownTop = useRef<number | null>(null);
  const seen = useRef<{ oldest: string | null; newest: string | null; height: number; total: number }>({
    oldest: null,
    newest: null,
    height: 0,
    total: 0,
  });
  const latest = useRef({ hasEarlier, loadingEarlier, loadEarlier });
  useEffect(() => {
    latest.current = { hasEarlier, loadingEarlier, loadEarlier };
  });

  const toBottom = useCallback(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    ownTop.current = pinToEnd(viewport);
    atBottom.current = true;
    setUnseen(false);
    setUnseenCount(0);
    setAway(false);
  }, []);

  // What changed in the list decides where the view goes.
  useLayoutEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null || newestId === null) return;
    const before = seen.current;
    if (before.newest === null) {
      ownTop.current = pinToEnd(viewport);
      atBottom.current = true;
    } else if (before.newest !== newestId) {
      if (atBottom.current || newestIsOurs) {
        ownTop.current = pinToEnd(viewport);
        atBottom.current = true;
        setUnseen(false);
        setUnseenCount(0);
      } else {
        setUnseen(true);
        setUnseenCount((count) => count + Math.max(1, total - before.total));
      }
    } else if (before.oldest !== oldestId) {
      // Earlier messages were added above: keep what the person was reading where it was.
      viewport.scrollTop += viewport.scrollHeight - before.height;
    }
    seen.current = { oldest: oldestId, newest: newestId, height: viewport.scrollHeight, total };
  }, [oldestId, newestId, newestIsOurs, total]);

  // Scrolling, and the content growing (a picture arriving).
  useEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    const onScroll = () => {
      // Our own scroll to the end, seen a frame late: not the person moving, so nothing about "away" changes.
      if (ownTop.current !== null && Math.abs(viewport.scrollTop - ownTop.current) <= 1) {
        ownTop.current = null;
        return;
      }
      ownTop.current = null;
      atBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < NEAR_BOTTOM_PX;
      setAway(!atBottom.current);
      if (atBottom.current) {
        setUnseen(false);
        setUnseenCount(0);
      }
      seen.current.height = viewport.scrollHeight;
      const { hasEarlier: more, loadingEarlier: busy, loadEarlier: load } = latest.current;
      if (viewport.scrollTop < NEAR_TOP_PX && more && !busy) load();
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const content = viewport.firstElementChild;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) ownTop.current = pinToEnd(viewport);
      seen.current.height = viewport.scrollHeight;
    });
    if (content !== null) observer.observe(content);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return { root, unseen, unseenCount, away, toBottom };
}
