"use client";

// Quick replies for the reply box (sales inbox spec, section 5): the list that opens after "/", which row is chosen, putting a
// reply (or the agency's payment details) in the box with its blanks filled, and the keys that drive the list. The box keeps
// the focus; Esc shuts the list until the next keystroke.
import { PAYMENT_DETAILS_SHORTCUT, type ConversationHeader, type QuickReply } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { useState, type KeyboardEvent, type RefObject } from "react";
import { toast } from "sonner";
import { formatMonthName } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { fillBlanks, matchingReplies, typedShortcut } from "./quick-reply-list";
import { useQuickReplies } from "./use-inbox-tools";

export function useQuickReplyPicker(
  header: ConversationHeader,
  text: string,
  setText: (text: string) => void,
  box: RefObject<HTMLTextAreaElement | null>,
) {
  const t = useTranslations("inbox.chat.composer");
  const me = useMe();
  const quickReplies = useQuickReplies();
  const [active, setActive] = useState(0);
  const [shut, setShut] = useState(false);
  const typed = typedShortcut(text);
  const shown = typed === null || shut ? null : matchingReplies(quickReplies.data ?? [], typed);

  /** Puts the reply in the box, in place of what was typed, or (for payment details) after it. */
  const place = (chosen: QuickReply, replaceAll: boolean) => {
    const filled = fillBlanks(chosen.body, { header, agent: me.user.name, monthOf: formatMonthName });
    const next = replaceAll || text.trim() === "" ? filled : `${text.trimEnd()}\n\n${filled}`;
    setText(next);
    setActive(0);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.length, next.length);
    });
  };
  const payment = () => {
    const details = quickReplies.data?.find((candidate) => candidate.shortcut === PAYMENT_DETAILS_SHORTCUT);
    if (details === undefined) toast.info(t("noPaymentDetails"));
    else place(details, false);
  };
  /** Handles a key meant for the open list; true when it did, so the box does nothing more with it. */
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (shown === null) return false;
    if (shown.length > 0) {
      const pick = shown[Math.min(active, shown.length - 1)];
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && pick !== undefined && !event.nativeEvent.isComposing) {
        event.preventDefault();
        place(pick, true);
        return true;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setShut(true);
      return true;
    }
    return false;
  };
  /** The box changed: the list opens again and the first row is chosen. */
  const typedSomething = () => {
    setShut(false);
    setActive(0);
  };
  return { shown, active, place, payment, onKey, typedSomething };
}
