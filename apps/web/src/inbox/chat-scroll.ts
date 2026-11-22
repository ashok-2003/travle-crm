"use client";

// How a chat scrolls, as WhatsApp's does: it opens at the newest message and stays there while new ones arrive; a new message
// scrolls into view only when the person was already at the bottom (or sent it), else `unseen` says there are new messages
// below; older messages are asked for as the top is reached, and the view does not jump when they are added above. Pictures
// that load later change the height, so a view at the bottom stays there. A chat left higher up opens where it was left, for
// the tab (the message at the top of the view, kept in the tab by id); one with unread messages lands on the first of them
// (inbox revamp spec, part 1 item 3), unless the person has scrolled by then.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

/** How near the bottom still counts as "at the bottom". */
const NEAR_BOTTOM_PX = 80;
/** How near the top asks for the earlier messages. */
const NEAR_TOP_PX = 120;
/** Landing on the first unread message leaves this much above it, for the divider that names them. */
const LAND_MARGIN_PX = 56;
/** A position is kept this long after the person stops scrolling. */
const KEEP_AFTER_MS = 200;

/** Where a chat was left: the message at the top of the view and how far below the view's top it was. */
interface Position {
  id: string;
  offset: number;
}

const positionKey = (key: string) => `inbox.scroll.${key}`;

function readPosition(key: string | null): Position | null {
  if (key === null) return null;
  try {
    const kept = JSON.parse(readTabValue(positionKey(key)) ?? "null") as Partial<Position> | null;
    return typeof kept?.id === "string" && typeof kept.offset === "number"
      ? { id: kept.id, offset: kept.offset }
      : null;
  } catch {
    return null;
  }
}

const messageIn = (viewport: HTMLElement, id: string) =>
  viewport.querySelector<HTMLElement>(`[data-message-id="${id}"]`);

/** How far below the viewport's top an element is now. */
const offsetOf = (viewport: HTMLElement, element: HTMLElement) =>
  element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;

const isAtBottom = (viewport: HTMLElement) =>
  viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < NEAR_BOTTOM_PX;

/** Where the view is: the first message showing at its top, or null at the bottom (where a chat opens anyway). */
function positionOf(viewport: HTMLElement): Position | null {
  if (isAtBottom(viewport)) return null;
  const top = viewport.getBoundingClientRect().top;
  const first = [...viewport.querySelectorAll<HTMLElement>("[data-message-id]")].find(
    (element) => element.getBoundingClientRect().bottom > top,
  );
  const id = first?.dataset.messageId;
  return first === undefined || id === undefined ? null : { id, offset: offsetOf(viewport, first) };
}

function keepPosition(key: string | null, position: Position | null): void {
  if (key !== null) keepTabValue(positionKey(key), position === null ? "" : JSON.stringify(position));
}

export interface ChatScrollInput {
  /** What the chat's position is kept under for the tab (its id), or null not to keep one (a search in the chat). */
  positionKey: string | null;
  /** The first message the member had not read as the chat opened: undefined until known, null when there was none. */
  landOn: string | null | undefined;
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
  const {
    positionKey: key,
    landOn,
    oldestId,
    newestId,
    newestIsOurs,
    total,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
  } = input;
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
  /** The person has scrolled since the chat opened: it no longer lands anywhere by itself. */
  const movedByPerson = useRef(false);
  const landed = useRef(false);
  const latest = useRef({ hasEarlier, loadingEarlier, loadEarlier, key });
  useEffect(() => {
    latest.current = { hasEarlier, loadingEarlier, loadEarlier, key };
  });

  /** Scrolls to `top` itself and says what that left. */
  const scrollTo = useCallback((viewport: HTMLElement, top: number) => {
    viewport.scrollTop = Math.max(0, top);
    ownTop.current = viewport.scrollTop;
    atBottom.current = isAtBottom(viewport);
    setAway(!atBottom.current);
  }, []);

  const toBottom = useCallback(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    ownTop.current = pinToEnd(viewport);
    atBottom.current = true;
    setUnseen(false);
    setUnseenCount(0);
    setAway(false);
    keepPosition(latest.current.key, null);
  }, []);

  // What changed in the list decides where the view goes.
  useLayoutEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null || newestId === null) return;
    const before = seen.current;
    if (before.newest === null) {
      // Opened: where it was left in this tab, if that message is shown; else at the newest.
      const kept = readPosition(key);
      const anchor = kept === null ? null : messageIn(viewport, kept.id);
      if (kept !== null && anchor !== null) {
        scrollTo(viewport, viewport.scrollTop + offsetOf(viewport, anchor) - kept.offset);
      } else {
        ownTop.current = pinToEnd(viewport);
        atBottom.current = true;
      }
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
  }, [key, oldestId, newestId, newestIsOurs, total, scrollTo]);

  // Once what was unread is known: the first unread message at the top, the divider above it in view.
  useLayoutEffect(() => {
    const viewport = viewportOf(root.current);
    if (landed.current || landOn === undefined || viewport === null) return;
    landed.current = true;
    const target = landOn === null ? null : messageIn(viewport, landOn);
    if (target === null || movedByPerson.current) return;
    scrollTo(viewport, viewport.scrollTop + offsetOf(viewport, target) - LAND_MARGIN_PX);
  }, [landOn, scrollTo]);

  // Scrolling, and the content growing (a picture arriving).
  useEffect(() => {
    const viewport = viewportOf(root.current);
    if (viewport === null) return;
    // Where the person scrolled to is read once a frame and kept a moment after they stop (and as the chat closes).
    let frame: number | undefined;
    let keeping: number | undefined;
    let unkept: { position: Position | null } | null = null;
    const keepNow = () => {
      if (unkept !== null) keepPosition(latest.current.key, unkept.position);
      unkept = null;
    };
    const onScroll = () => {
      // Our own scroll to the end, seen a frame late: not the person moving, so nothing about "away" changes.
      if (ownTop.current !== null && Math.abs(viewport.scrollTop - ownTop.current) <= 1) {
        ownTop.current = null;
        return;
      }
      ownTop.current = null;
      movedByPerson.current = true;
      atBottom.current = isAtBottom(viewport);
      setAway(!atBottom.current);
      frame ??= window.requestAnimationFrame(() => {
        frame = undefined;
        unkept = { position: positionOf(viewport) };
        window.clearTimeout(keeping);
        keeping = window.setTimeout(keepNow, KEEP_AFTER_MS);
      });
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
      // Left mid-scroll: where it stood is kept now.
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.clearTimeout(keeping);
      keepNow();
    };
  }, []);

  return { root, unseen, unseenCount, away, toBottom };
}
