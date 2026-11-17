// What to do next about a follow-up, read from its lead's WhatsApp chat and what the AI did when it came due.
import type { FollowUpRow } from "@travel-crm/contracts/ai";

export type NextMove = "answer-whatsapp" | "replied-window-closed" | "call" | "call-or-template";

/** Whether the customer wrote last: the follow-up has an answer waiting. */
export function replied(row: FollowUpRow): boolean {
  return row.whatsapp?.lastFrom === "customer";
}

/** The suggested next move, or null while nothing has happened yet (or the AI is switched off) to base one on. */
export function nextMove(row: FollowUpRow): NextMove | null {
  if (replied(row)) return row.whatsapp?.windowOpen === true ? "answer-whatsapp" : "replied-window-closed";
  switch (row.ai?.outcome) {
    case "sent":
      return "call";
    case "window_closed":
    case "no_chat":
    case "opted_out":
    case "failed":
      return "call-or-template";
    case "off":
    case undefined:
      return null;
  }
}
