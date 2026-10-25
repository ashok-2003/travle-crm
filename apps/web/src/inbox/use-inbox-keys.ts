"use client";

// The inbox's keys (sales inbox spec 3), when the person is not typing in a box: "/" goes to the chats' search, Esc
// closes the open chat, and Alt with the arrows moves to the chat above or below in the list.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { inboxRoute, routes } from "@/lib/routes";

const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function useInboxKeys(conversationId: string | null) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog, menu or sheet open has the keys to itself (Esc closes it, not the chat).
      if (event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]') !== null) return;
      if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-chat-row="true"]')];
        const here = links.findIndex((link) => link.dataset.chatId === conversationId);
        const next = links[here + (event.key === "ArrowDown" ? 1 : -1)] ?? (here === -1 ? links[0] : undefined);
        if (next?.dataset.chatId !== undefined) {
          event.preventDefault();
          router.push(inboxRoute(next.dataset.chatId));
        }
        return;
      }
      if (typingIn(event.target)) return;
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>('[data-inbox-search] input[type="search"]');
        if (search !== null) {
          event.preventDefault();
          search.focus();
        }
      } else if (event.key === "Escape" && conversationId !== null) {
        router.push(routes.inbox);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [conversationId, router]);
}
