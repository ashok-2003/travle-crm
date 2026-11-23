"use client";

// The inbox's reads (inbox.*): the status, the list of chats and a chat's header and messages. The lists are keyed under
// their procedure's path, so one refresh reaches them all. What changes on its own (a customer's message, a delivery) is
// told by the live stream (use-inbox-live.ts), which loads again what it touches; under it every read asks again once a
// minute (INBOX_POLL_MS), never in a hidden tab, in case the stream missed something. A row's chat (its header and newest
// page of messages) is asked for as the pointer rests on the row or the row gets the focus, so it opens at once.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { INBOX_POLL_MS, type ConversationFilter, type ConversationPeriod } from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useHolds } from "@/session/me-context";
import { LIVE_FRESH_MS, useLiveConnected } from "./live-state";

const POLL_MS = INBOX_POLL_MS;
/** While a teammate is replying, the chat's bar asks again this often, to see them stop (the api's REPLYING_POLL_MS). */
const REPLYING_POLL_MS = 15_000;
/** A chat asked for ahead (the pointer on its row) is not asked for again within this long. */
const PREFETCH_FRESH_MS = 10_000;
/**
 * A chat is live: what the saved copy of the last visit holds (a tick, a waiting mark) may be seconds old and already wrong, so
 * opening one always asks again, and the copy only fills the screen until the answer comes.
 */
const LIVE = 0;

/** A chat's reads stay fresh a few seconds while the stream tells of every change; without it, never. */
function useChatFreshness(): number {
  return useLiveConnected() ? LIVE_FRESH_MS : LIVE;
}

/** Loads every inbox read again (the chats, a chat's header and messages): something changed that no poll has seen yet. */
export function useRefreshInbox(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() }), [queryClient, trpc]);
}

export function useInboxStatus() {
  const trpc = useTRPC();
  return useQuery(trpc.inbox.status.queryOptions());
}

/**
 * Asks for what the chat list shows beside its chats (the people's names for the owner initials, and the tags) together
 * with the inbox's status, instead of after the list has loaded. Both are slow-changing data kept ten minutes.
 */
export function usePrefetchInboxLists() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mayViewLeads = useHolds("leads:view");
  useEffect(() => {
    // Errors are swallowed: the list asks again on its own.
    if (mayViewLeads) queryClient.query(trpc.leads.owners.queryOptions()).catch(() => undefined);
    queryClient.query(trpc.inbox.tags.queryOptions()).catch(() => undefined);
  }, [mayViewLeads, queryClient, trpc]);
}

export interface ConversationQuery {
  filter: ConversationFilter;
  search: string;
  tagId: string | null;
  stage: LeadStage | null;
  period: ConversationPeriod | null;
  /** Only the chats on this WhatsApp number. */
  connectionId: string | null;
}

/** What a page of the chats is asked with: the list's choices, and the cursor (none for the first page). */
export function conversationsInput(input: ConversationQuery, cursor: string | null) {
  return {
    filter: input.filter,
    ...(input.search !== "" && { search: input.search }),
    ...(input.tagId !== null && { tagId: input.tagId }),
    ...(input.stage !== null && { stage: input.stage }),
    ...(input.period !== null && { period: input.period }),
    // A list kept from before the filter (its key read back by live-refresh.ts) has no number at all.
    ...(typeof input.connectionId === "string" && { connectionId: input.connectionId }),
    ...(cursor !== null && { before: cursor }),
  };
}

export function useConversations(input: ConversationQuery) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.inbox.conversations.pathKey(), input],
    page: (cursor) => client.inbox.conversations.query(conversationsInput(input, cursor)),
    items: (page) => page.items,
    refetchInterval: POLL_MS,
    staleTime: LIVE,
  });
}

export function useConversation(conversationId: string) {
  const trpc = useTRPC();
  const valid = recordId.safeParse(conversationId).success;
  const query = useQuery({
    ...trpc.inbox.conversation.queryOptions(valid ? { conversationId } : skipToken),
    refetchInterval: (current) => ((current.state.data?.replying.length ?? 0) > 0 ? REPLYING_POLL_MS : POLL_MS),
    staleTime: useChatFreshness(),
  });
  return { ...query, valid };
}

/** A search in the chat: words to find, and whether only the starred messages show. */
export interface MessageFilter {
  search: string;
  starredOnly: boolean;
}

/** What a page of a chat's messages is asked with, beyond the chat: a search, the starred only. */
export const narrowingOf = (filter: MessageFilter) => ({
  ...(filter.search.length >= 2 && { search: filter.search }),
  ...(filter.starredOnly && { starredOnly: true }),
});

export function useMessages(
  conversationId: string,
  enabled: boolean,
  filter: MessageFilter = { search: "", starredOnly: false },
) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const narrowing = narrowingOf(filter);
  return useCursorPages({
    queryKey: [...trpc.inbox.messages.pathKey(), conversationId, narrowing],
    page: (cursor) =>
      client.inbox.messages.query({ conversationId, ...narrowing, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.items,
    enabled,
    staleTime: useChatFreshness(),
    refetchInterval: POLL_MS,
  });
}

/**
 * Asks ahead for what opening a chat shows first, its header and newest page of messages (inbox revamp spec, part 1 item
 * 3), unless that was asked for in the last few seconds. Errors are the chat's own to show when it opens.
 */
export function usePrefetchChat(): (conversationId: string) => void {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  return useCallback(
    (conversationId: string) => {
      const narrowing = narrowingOf({ search: "", starredOnly: false });
      const ignore = () => undefined;
      queryClient
        .query({ ...trpc.inbox.conversation.queryOptions({ conversationId }), staleTime: PREFETCH_FRESH_MS })
        .catch(ignore);
      queryClient
        .infiniteQuery({
          queryKey: [...trpc.inbox.messages.pathKey(), conversationId, narrowing],
          queryFn: ({ pageParam }: { pageParam: string | null }) =>
            client.inbox.messages.query({ conversationId, ...(pageParam !== null && { before: pageParam }) }),
          initialPageParam: null as string | null,
          getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor,
          staleTime: PREFETCH_FRESH_MS,
        })
        .catch(ignore);
    },
    [client, queryClient, trpc],
  );
}

/** The chat of the person a lead belongs to, for the lead's page. */
export function useLeadChat(leadId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.leadChat.queryOptions(enabled ? { leadId } : skipToken) });
}

/** A presigned link to a message's stored file, fetched only once the message is on screen. */
export function useMediaLink(messageId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.mediaUrl.queryOptions(enabled ? { messageId } : skipToken), staleTime: 4 * 60_000 });
}

/** A chat's photos and videos, newest first, a page at a time: the contact panel's gallery. */
export function useChatMedia(conversationId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.inbox.media.pathKey(), conversationId],
    page: (cursor) => client.inbox.media.query({ conversationId, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.items,
    staleTime: LIVE,
  });
}
