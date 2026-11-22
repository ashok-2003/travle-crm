// The chats the AI answered in the last 24 hours, in one place: the AI agent page's "Chats answered" counts them and the
// inbox's Answered by the AI filter lists them, so the number and the list behind it can't drift apart.
import type { ConversationWhere } from "./scope.js";

const DAY_MS = 86_400_000;

/**
 * The chats the inbox can list (not a blocked contact's, not erased), archived and snoozed ones too, in which the AI sent
 * a message in the 24 hours before `now`. The AI's messages are those whose client token starts "ai:".
 */
export const answeredByAiWhere = (now: Date): ConversationWhere => ({
  hidden: false,
  state: "open",
  messages: {
    some: {
      direction: "out",
      clientToken: { startsWith: "ai:" },
      occurredAt: { gte: new Date(now.getTime() - DAY_MS) },
    },
  },
});
