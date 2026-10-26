"use client";

// The sales inbox's reads and changes beyond WhatsApp (salesInbox.*; sales inbox spec 6): the counts above the chats,
// stars, snooze, team notes, messages sent later, "someone is replying", the automatic answers and broadcasts. A change
// loads again only what it changed (the polls are every 15 seconds already, so a change must not set off all of them).
import { INBOX_POLL_MS } from "@travel-crm/contracts/inbox";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTRPC } from "@/data/trpc";

const POLL_MS = INBOX_POLL_MS;

/** Loads these queries again, by the keys the router gives (a procedure's path covers every input it was asked with). */
export function useInvalidate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (
    which: "chats" | "chat" | "messages" | "summary" | "notes" | "scheduled" | "automation" | "keywords" | "broadcasts",
  ) => {
    const keys = {
      chats: trpc.inbox.conversations.pathKey(),
      chat: trpc.inbox.conversation.pathKey(),
      messages: trpc.inbox.messages.pathKey(),
      summary: trpc.salesInbox.summary.pathKey(),
      notes: trpc.salesInbox.notes.pathKey(),
      scheduled: trpc.salesInbox.scheduled.pathKey(),
      automation: trpc.salesInbox.automation.pathKey(),
      keywords: trpc.salesInbox.keywordReplies.pathKey(),
      broadcasts: trpc.salesInbox.broadcasts.pathKey(),
    } as const;
    return queryClient.invalidateQueries({ queryKey: keys[which] });
  };
}

export function useInboxSummary() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.summary.queryOptions(), refetchInterval: POLL_MS, staleTime: 0 });
}

export function useStar() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(trpc.salesInbox.star.mutationOptions({ onSuccess: () => invalidate("messages") }));
}

export function useSnooze() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(
    trpc.salesInbox.snooze.mutationOptions({
      onSuccess: () => Promise.all([invalidate("chats"), invalidate("chat"), invalidate("summary")]),
    }),
  );
}

export function useNotes(conversationId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.notes.queryOptions({ conversationId }), refetchInterval: POLL_MS });
}

export function useAddNote() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(trpc.salesInbox.addNote.mutationOptions({ onSuccess: () => invalidate("notes") }));
}

export function useScheduled(conversationId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.scheduled.queryOptions({ conversationId }), refetchInterval: POLL_MS });
}

export function useSchedule() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const refresh = () => invalidate("scheduled");
  return {
    schedule: useMutation(trpc.salesInbox.schedule.mutationOptions({ onSuccess: refresh })),
    cancel: useMutation(trpc.salesInbox.cancelScheduled.mutationOptions({ onSuccess: refresh })),
  };
}

/** Tells the others the member is typing here, at most once every four seconds. */
export function useTypingSignal(conversationId: string) {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.salesInbox.typing.mutationOptions());
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < 4_000) return;
    last.current = now;
    mutate({ conversationId });
  };
}

export function useAutomation(enabled: boolean) {
  const trpc = useTRPC();
  return {
    settings: useQuery(trpc.salesInbox.automation.queryOptions(enabled ? undefined : skipToken)),
    keywords: useQuery(trpc.salesInbox.keywordReplies.queryOptions(enabled ? undefined : skipToken)),
  };
}

export function useAutomationChanges() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const refreshKeywords = () => invalidate("keywords");
  return {
    save: useMutation(trpc.salesInbox.saveAutomation.mutationOptions({ onSuccess: () => invalidate("automation") })),
    addKeyword: useMutation(trpc.salesInbox.createKeywordReply.mutationOptions({ onSuccess: refreshKeywords })),
    removeKeyword: useMutation(trpc.salesInbox.deleteKeywordReply.mutationOptions({ onSuccess: refreshKeywords })),
  };
}

export function useBroadcasts(enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(trpc.salesInbox.broadcasts.queryOptions(enabled ? undefined : skipToken));
}

export function useBroadcastReach(tagId: string | null) {
  const trpc = useTRPC();
  return useQuery(trpc.salesInbox.broadcastReach.queryOptions(tagId === null ? skipToken : { tagId }));
}

export function useSendBroadcast() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(trpc.salesInbox.sendBroadcast.mutationOptions({ onSuccess: () => invalidate("broadcasts") }));
}
