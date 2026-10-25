"use client";

// The sales inbox's reads and changes beyond WhatsApp (salesInbox.*; sales inbox spec 6): the counts above the chats,
// stars, snooze, team notes, messages sent later, "someone is replying", the automatic answers and broadcasts. A change
// loads the inbox's lists and the chat again, so every place shows it.
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTRPC } from "@/data/trpc";

const POLL_MS = 15_000;

function useRefreshAll() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.salesInbox.pathKey() }),
    ]);
  };
}

export function useInboxSummary() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.summary.queryOptions(), refetchInterval: POLL_MS, staleTime: 0 });
}

export function useStar() {
  const trpc = useTRPC();
  const refresh = useRefreshAll();
  return useMutation(trpc.salesInbox.star.mutationOptions({ onSuccess: refresh }));
}

export function useSnooze() {
  const trpc = useTRPC();
  const refresh = useRefreshAll();
  return useMutation(trpc.salesInbox.snooze.mutationOptions({ onSuccess: refresh }));
}

export function useNotes(conversationId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.notes.queryOptions({ conversationId }), refetchInterval: POLL_MS });
}

export function useAddNote() {
  const trpc = useTRPC();
  const refresh = useRefreshAll();
  return useMutation(trpc.salesInbox.addNote.mutationOptions({ onSuccess: refresh }));
}

export function useScheduled(conversationId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.salesInbox.scheduled.queryOptions({ conversationId }), refetchInterval: POLL_MS });
}

export function useSchedule() {
  const trpc = useTRPC();
  const refresh = useRefreshAll();
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
  const refresh = useRefreshAll();
  return {
    save: useMutation(trpc.salesInbox.saveAutomation.mutationOptions({ onSuccess: refresh })),
    addKeyword: useMutation(trpc.salesInbox.createKeywordReply.mutationOptions({ onSuccess: refresh })),
    removeKeyword: useMutation(trpc.salesInbox.deleteKeywordReply.mutationOptions({ onSuccess: refresh })),
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
  const refresh = useRefreshAll();
  return useMutation(trpc.salesInbox.sendBroadcast.mutationOptions({ onSuccess: refresh }));
}
