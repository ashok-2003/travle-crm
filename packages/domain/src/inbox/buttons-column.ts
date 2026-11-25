// Reads a message's `buttons` column (JSON written by queueSystemText) back: a card's reply buttons (an array), or a list's
// button and rows (an object), or null when it holds neither.
import { chatButtons, chatList, type ChatList } from "@travel-crm/contracts/inbox";

export function buttonsOf(column: unknown): { id: string; title: string }[] | null {
  const parsed = chatButtons.safeParse(column);
  return parsed.success ? parsed.data : null;
}

export function listOf(column: unknown): ChatList | null {
  const parsed = chatList.safeParse(column);
  return parsed.success ? parsed.data : null;
}
