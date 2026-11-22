"use client";

// The inbox's keys (sales inbox spec 3; inbox revamp spec, part 1 item 6). Anywhere: Alt with ↑ or ↓ goes to the chat above
// or below in the list (from a reply box, into the next chat's reply box), and Ctrl+K (⌘K on a Mac) to the chats' search.
// When the person is not typing in a box: ↑ and ↓ alone do the same, unless the focus or the last click is in the contact
// panel, the chat's bar or a scrolling part other than the list (the messages), where they keep their own use; "/" goes to
// the search, and Esc closes the contact panel kept open beside the chat, or else the open chat. A dialog, menu or sheet
// open keeps its keys. Enter sends and Shift+Enter makes a new line in the reply box, which is the box's own (composer.tsx).
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { inboxRoute, routes } from "@/lib/routes";
import { useInboxPanes } from "./inbox-panes";
import { askReplyFocus } from "./reply-focus";

const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const among = (target: EventTarget | null, selector: string) =>
  target instanceof Element && target.closest(selector) !== null;

const plain = (event: KeyboardEvent) => !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

/** Whether something scrolls of its own between the element and the page: arrows there scroll it. */
function insideScrolling(element: Element): boolean {
  // The chats' own list: the arrows move along it.
  if (element.closest("[data-chat-list]") !== null) return false;
  for (let node: Element | null = element; node !== null && node !== document.body; node = node.parentElement) {
    if (node.matches('[data-slot="scroll-area-viewport"]')) return true;
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return true;
  }
  return false;
}

/** Whether ↑ and ↓ alone belong to where the person is: the contact panel, the chat's bar, or a part that scrolls. */
const arrowsBelongTo = (target: EventTarget | null) =>
  target instanceof Element &&
  (target.closest("[data-contact-panel], [data-chat-header]") !== null || insideScrolling(target));

function focusSearch(): boolean {
  const search = document.querySelector<HTMLInputElement>('[data-inbox-search] input[type="search"]');
  search?.focus();
  return search !== null;
}

export function useInboxKeys(conversationId: string | null) {
  const router = useRouter();
  const panes = useInboxPanes();
  const latestPanes = useRef(panes);
  useEffect(() => {
    latestPanes.current = panes;
  });
  useEffect(() => {
    /** Where the person last pressed the pointer: arrows after a click among the messages scroll them. */
    let pressedIn: EventTarget | null = null;
    const onPointer = (event: PointerEvent) => {
      pressedIn = event.target;
    };
    /** Opens the chat a step above or below the open one (the first, when none is open); false when there is none. */
    const move = (step: 1 | -1): boolean => {
      const rows = [...document.querySelectorAll<HTMLAnchorElement>('[data-chat-row="true"]')];
      const here = rows.findIndex((row) => row.dataset.chatId === conversationId);
      const next = rows[here + step] ?? (here === -1 ? rows[0] : undefined);
      const id = next?.dataset.chatId;
      if (next === undefined || id === undefined) return false;
      next.scrollIntoView({ block: "nearest" });
      // The focus follows along the list when it was there; from a reply box, into the next chat's.
      if (among(document.activeElement, '[data-chat-row="true"]')) next.focus();
      else if (among(document.activeElement, "[data-reply-box]")) askReplyFocus(id);
      router.push(inboxRoute(id));
      return true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]') !== null) return;
      const arrow = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null;
      if (arrow !== null && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (move(arrow)) event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        if (focusSearch()) event.preventDefault();
        return;
      }
      if (typingIn(event.target)) return;
      if (arrow !== null && plain(event)) {
        if (arrowsBelongTo(event.target) || arrowsBelongTo(pressedIn)) return;
        if (move(arrow)) event.preventDefault();
        return;
      }
      if (event.key === "/" && plain(event)) {
        if (focusSearch()) event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        const shown = latestPanes.current;
        if (shown?.panelDocks === true && shown.panelOpen && document.querySelector("[data-contact-panel]") !== null) {
          shown.setPanelOpen(false);
          document.querySelector<HTMLButtonElement>("[data-panel-toggle]")?.focus();
        } else if (conversationId !== null) {
          router.push(routes.inbox);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, { capture: true });
    };
  }, [conversationId, router]);
}
