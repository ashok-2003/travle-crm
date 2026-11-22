// Who is typing a reply in which chat (sales inbox spec 6: "Priya is replying", so two don't answer at once). Kept in this
// process's memory for a few seconds, never stored: best effort, as the spec's presence is (D24). It is right for ONE api
// instance, the pilot's; behind several, each instance would only know its own members' typing, and presence would move to
// a shared store. Keyed by organization and chat, so one agency never sees another's; expired marks are swept on every
// write, so the map can't outgrow the seconds it remembers; and it stops taking new marks past a ceiling. A member who
// starts typing, or sends, is told to whoever watches (the live stream, inbox revamp spec part 1 item 4), so the others'
// chat bars show it at once; while a bar shows someone replying it asks again every REPLYING_POLL_MS.

/** How often a chat bar showing someone replying asks again, to see them stop. */
export const REPLYING_POLL_MS = 15_000;
/** A mark outlasts one of those asks (and the four seconds between a member's signals), so the ask that follows sees it. */
export const TYPING_LIFETIME_MS = REPLYING_POLL_MS + 5_000;
/** The most chats marked at once, across every agency on this instance. */
const MAX_MARKED_CHATS = 5_000;

/** "organization:chat" → user id → until when. */
const typing = new Map<string, Map<string, number>>();

const keyOf = (organizationId: string, conversationId: string) => `${organizationId}:${conversationId}`;

type TypingWatcher = (organizationId: string, conversationId: string) => void;
const watchers = new Set<TypingWatcher>();

/** Told when someone starts typing in a chat or stops by sending; returns the way to stop watching. */
export function watchTyping(watcher: TypingWatcher): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

const tell = (organizationId: string, conversationId: string) => {
  for (const watcher of watchers) watcher(organizationId, conversationId);
};

function sweep(now: number): void {
  for (const [key, chat] of typing) {
    for (const [userId, until] of chat) if (until <= now) chat.delete(userId);
    if (chat.size === 0) typing.delete(key);
  }
}

/** The member is typing in the chat now. The caller has checked that they may see it. */
export function markTyping(organizationId: string, conversationId: string, userId: string, now = Date.now()): void {
  sweep(now);
  const key = keyOf(organizationId, conversationId);
  const chat = typing.get(key);
  if (chat === undefined && typing.size >= MAX_MARKED_CHATS) return;
  const marks = chat ?? new Map<string, number>();
  const started = !marks.has(userId);
  marks.set(userId, now + TYPING_LIFETIME_MS);
  typing.set(key, marks);
  if (started) tell(organizationId, conversationId);
}

/** The member sent their reply: they are no longer typing. */
export function clearTyping(organizationId: string, conversationId: string, userId: string): void {
  const key = keyOf(organizationId, conversationId);
  const chat = typing.get(key);
  if (chat?.delete(userId) !== true) return;
  if (chat.size === 0) typing.delete(key);
  tell(organizationId, conversationId);
}

/** The members typing in the chat now, other than the one asking. */
export function typingIn(
  organizationId: string,
  conversationId: string,
  exceptUserId: string,
  now = Date.now(),
): string[] {
  const chat = typing.get(keyOf(organizationId, conversationId));
  if (chat === undefined) return [];
  return [...chat].filter(([userId, until]) => until > now && userId !== exceptUserId).map(([userId]) => userId);
}

/** How many chats are marked (for a test). */
export const presenceSize = (): number => typing.size;

/** Forgets everything (for a test). */
export const resetPresence = (): void => {
  typing.clear();
};
