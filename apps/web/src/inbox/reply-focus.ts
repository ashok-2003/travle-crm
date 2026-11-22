// Alt+↑ or Alt+↓ from a chat's reply box opens the next chat with the focus in its reply box (inbox revamp spec, part 1
// item 6): the keys ask for it, and the next chat's box takes it once it is on screen.
let wanted: string | null = null;

/** The chat that opens next should take the focus in its reply box. */
export function askReplyFocus(conversationId: string): void {
  wanted = conversationId;
}

/** Whether this chat's reply box should take the focus now (asked for once). */
export function takeReplyFocus(conversationId: string): boolean {
  if (wanted !== conversationId) return false;
  wanted = null;
  return true;
}
