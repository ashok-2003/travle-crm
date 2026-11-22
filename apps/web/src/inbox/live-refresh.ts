// What the browser loads again when the live stream tells of a change (inbox revamp spec, part 1 item 4), kept light so the
// stream never loads the api more than the poll it replaced. The chats' list and the counts at most once every
// LISTS_EVERY_MS, by the list's first page alone; the open chat's parts, as the change touches them, GATHER_MS after it
// (its header; its newest page of messages; its notes, messages sent later and the AI's state; typing, its header alone).
// Other chats are only marked stale, and load as they are opened. A load already out is never cancelled: one more round
// follows it. In a hidden tab nothing loads; what changed is marked stale and loads as the tab is looked at again.
import type { InboxLiveChange, InboxLiveEvent } from "@travel-crm/contracts/inbox";
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { useTRPC, useTRPCClient } from "@/data/trpc";
import { withFirstPage } from "./first-page";
import { conversationsInput, type ConversationQuery } from "./use-inbox";

/** Changes this close together are one load. */
export const GATHER_MS = 300;
/** The chats' list and the counts load at most this often, however busy the inbox. */
export const LISTS_EVERY_MS = 3_000;

/** A part of a chat a change may touch. */
type ChatPart = "header" | "messages" | "notes" | "scheduled" | "ai";

const partsOf: Record<InboxLiveChange, readonly ChatPart[]> = {
  message: ["header", "messages"],
  status: ["messages"],
  chat: ["header", "notes", "scheduled", "ai"],
  typing: ["header"],
};

/**
 * Runs `work` once it has been asked for, GATHER_MS later and at most once every `everyMs`. Asked again while it runs, or
 * when it says something it should load was already loading (false), it runs once more after.
 */
export function throttle(work: () => Promise<boolean>, everyMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  const ask = (): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    timer ??= setTimeout(run, Math.max(GATHER_MS, lastStart + everyMs - Date.now()));
  };
  const run = () => {
    timer = undefined;
    running = true;
    lastStart = Date.now();
    void work()
      .catch(() => true)
      .then((done) => {
        running = false;
        if (!done || again) {
          again = false;
          ask();
        }
      });
  };
  return {
    ask,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

interface Page {
  items: readonly { id: string }[];
  nextCursor: string | null;
}

export function createLiveRefresh({
  queryClient,
  trpc,
  client,
  openId,
}: {
  queryClient: QueryClient;
  trpc: ReturnType<typeof useTRPC>;
  client: ReturnType<typeof useTRPCClient>;
  /** The chat in front of the member, if any. */
  openId: () => string | null;
}) {
  const hidden = () => document.visibilityState === "hidden";
  const keyOf = (part: ChatPart, conversationId: string): QueryKey =>
    part === "header"
      ? trpc.inbox.conversation.queryKey({ conversationId })
      : part === "messages"
        ? [...trpc.inbox.messages.pathKey(), conversationId]
        : part === "notes"
          ? trpc.salesInbox.notes.queryKey({ conversationId })
          : part === "scheduled"
            ? trpc.salesInbox.scheduled.queryKey({ conversationId })
            : trpc.ai.chatAi.queryKey({ conversationId });
  const markStale = (queryKey: QueryKey) => queryClient.invalidateQueries({ queryKey, refetchType: "none" });

  /** One query loaded again, never cancelling a load already out; after one, once more, as it began before the change. */
  async function reload(queryKey: QueryKey): Promise<void> {
    if (hidden()) return markStale(queryKey);
    const wasLoading = queryClient.isFetching({ queryKey }) > 0;
    await queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
    if (wasLoading) await queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
  }

  /** The first page of each list shown under `queryKey`; false when one was loading (it is asked again after). */
  async function reloadFirstPages<P extends Page>(queryKey: QueryKey, first: (key: QueryKey) => Promise<P>) {
    if (hidden()) {
      await markStale(queryKey);
      return true;
    }
    let done = true;
    const shown = queryClient.getQueryCache().findAll({ queryKey, type: "active" });
    await Promise.all(
      shown.map(async (query) => {
        if (query.state.fetchStatus === "fetching") {
          done = false;
          return;
        }
        const page = await first(query.queryKey).catch(() => null);
        if (page === null) return;
        queryClient.setQueryData<InfiniteData<P, string | null>>(query.queryKey, (data) =>
          data === undefined ? data : withFirstPage(data, page),
        );
      }),
    );
    return done;
  }

  const lists = throttle(async () => {
    const [done] = await Promise.all([
      reloadFirstPages(trpc.inbox.conversations.pathKey(), (key) =>
        client.inbox.conversations.query(conversationsInput(key[1] as ConversationQuery, null)),
      ),
      reload(trpc.salesInbox.summary.pathKey()),
    ]);
    return done;
  }, LISTS_EVERY_MS);

  const openParts = new Set<ChatPart>();
  const openChat = throttle(async () => {
    const conversationId = openId();
    const parts = [...openParts];
    openParts.clear();
    if (conversationId === null) return true;
    const results = await Promise.all(
      parts.map(async (part) => {
        if (part !== "messages") {
          await reload(keyOf(part, conversationId));
          return true;
        }
        const done = await reloadFirstPages(keyOf("messages", conversationId), (key) =>
          client.inbox.messages.query({ conversationId, ...(key[2] as object) }),
        );
        if (!done) openParts.add("messages");
        return done;
      }),
    );
    return results.every(Boolean);
  }, GATHER_MS);

  /** Whether anything shown under the key was loaded before `before`. */
  const loadedBefore = (queryKey: QueryKey, before: number) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey, type: "active" })
      .some((query) => query.state.dataUpdatedAt < before);

  return {
    /** A change the stream told of. */
    touched(event: InboxLiveEvent): void {
      if (event.change !== "typing") lists.ask();
      const parts = partsOf[event.change];
      if (event.conversationId === openId()) {
        for (const part of parts) openParts.add(part);
        openChat.ask();
      } else {
        for (const part of parts) void markStale(keyOf(part, event.conversationId));
      }
    },
    /** The stream (re)connected: the list's first page, the counts and the open chat, if loaded before `before`. */
    connected(before: number): void {
      if (
        loadedBefore(trpc.inbox.conversations.pathKey(), before) ||
        loadedBefore(trpc.salesInbox.summary.pathKey(), before)
      )
        lists.ask();
      const conversationId = openId();
      if (conversationId === null) return;
      if (
        loadedBefore(keyOf("header", conversationId), before) ||
        loadedBefore(keyOf("messages", conversationId), before)
      ) {
        openParts.add("header");
        openParts.add("messages");
        openChat.ask();
      }
    },
    stop(): void {
      lists.stop();
      openChat.stop();
    },
  };
}
