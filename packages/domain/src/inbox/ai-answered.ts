// The chats the AI answered in the last 24 hours, in one place: the AI agent page's "Chats answered" counts them and the
// inbox's Answered by the AI filter lists them, so the number and the list behind it can't drift apart.
import type { ConversationWhere } from "./scope.js";

const DAY_MS = 86_400_000;

/** The chats the inbox can list at all: not a blocked contact's, not erased. The AI agent page counts no other. */
export const listedChatWhere = { hidden: false, state: "open" } as const satisfies ConversationWhere;

/**
 * The listed chats, archived and snoozed ones too, in which the AI sent a message in the 24 hours before `now`. The AI's
 * messages are those whose client token starts "ai:". Every write keeps `lastMessageAt` at the chat's newest message,
 * so it bounds the same chats and lets the list and the count read the recent-chats index.
 */
export function answeredByAiWhere(now: Date): ConversationWhere {
  const since = new Date(now.getTime() - DAY_MS);
  return {
    ...listedChatWhere,
    lastMessageAt: { gte: since },
    messages: { some: { direction: "out", clientToken: { startsWith: "ai:" }, occurredAt: { gte: since } } },
  };
}
