// Who is typing a reply in which chat (sales inbox spec 6: "Priya is replying", so two don't answer at once). Kept in the
// api's memory for a few seconds, never stored: best effort, as the spec's presence is (D24), right for one api instance.
const TYPING_MS = 8_000;

/** conversation id → user id → until when. */
const typing = new Map<string, Map<string, number>>();

/** The member is typing in the chat now. */
export function markTyping(conversationId: string, userId: string, now = Date.now()): void {
  const chat = typing.get(conversationId) ?? new Map<string, number>();
  chat.set(userId, now + TYPING_MS);
  typing.set(conversationId, chat);
}

/** The members typing in the chat now, other than the one asking. */
export function typingIn(conversationId: string, exceptUserId: string, now = Date.now()): string[] {
  const chat = typing.get(conversationId);
  if (chat === undefined) return [];
  for (const [userId, until] of chat) if (until <= now) chat.delete(userId);
  if (chat.size === 0) typing.delete(conversationId);
  return [...chat.keys()].filter((userId) => userId !== exceptUserId);
}
