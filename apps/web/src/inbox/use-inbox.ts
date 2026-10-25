"use client";

// The inbox's reads (inbox.*): the status, the list of chats and a chat's header and messages. The lists are keyed under
// their procedure's path, so one refresh reaches them all; a chat refetches every 15 seconds while it is open, since new
// messages arrive without the person doing anything (no websocket, spec 4.4 S1).
import type { ConversationFilter } from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

const POLL_MS = 15_000;
/** While one of our messages is still on its way (queued, sending or sent, not yet delivered), the chat looks more often. */
const UNSETTLED_POLL_MS = 5_000;
/**
 * A chat is live: what the saved copy of the last visit holds (a tick, a waiting mark) may be seconds old and already wrong, so
 * opening one always asks again, and the copy only fills the screen until the answer comes.
 */
const LIVE = 0;

export function useInboxStatus() {
  const trpc = useTRPC();
  return useQuery(trpc.inbox.status.queryOptions());
}

export function useConversations(input: { filter: ConversationFilter; search: string; tagId: string | null }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const search = input.search === "" ? {} : { search: input.search };
  const tag = input.tagId === null ? {} : { tagId: input.tagId };
  return useCursorPages({
    queryKey: [...trpc.inbox.conversations.pathKey(), input],
    page: (cursor) =>
      client.inbox.conversations.query({
        filter: input.filter,
        ...search,
        ...tag,
        ...(cursor !== null && { before: cursor }),
      }),
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
    refetchInterval: POLL_MS,
    staleTime: LIVE,
  });
  return { ...query, valid };
}

export function useMessages(conversationId: string, enabled: boolean) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.inbox.messages.pathKey(), conversationId],
    page: (cursor) => client.inbox.messages.query({ conversationId, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.items,
    enabled,
    staleTime: LIVE,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some(
          (message) => message.direction === "out" && ["queued", "sending", "sent"].includes(message.status),
        ),
      )
        ? UNSETTLED_POLL_MS
        : POLL_MS,
  });
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
