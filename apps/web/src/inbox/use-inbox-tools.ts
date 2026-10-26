"use client";

// The sales inbox's reads and changes (sales inbox spec, section 5): the agency's tags and quick replies, a chat's tags,
// pin and archive, and the read mark that clears a member's unread count. A change loads again only what it changed.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useInvalidate } from "./use-sales-inbox";

export function useTags() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.tags.queryOptions(), staleTime: 60_000 });
}

export function useQuickReplies() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.quickReplies.queryOptions(), staleTime: 60_000 });
}

/** After a change to a chat: the lists, its header, and the counts above them. */
function useRefreshChat() {
  const invalidate = useInvalidate();
  return () => Promise.all([invalidate("chats"), invalidate("chat"), invalidate("summary")]);
}

export function useSetTags() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(
    trpc.inbox.setTags.mutationOptions({ onSuccess: () => Promise.all([invalidate("chats"), invalidate("chat")]) }),
  );
}

export function usePin() {
  const trpc = useTRPC();
  const refresh = useRefreshChat();
  return useMutation(trpc.inbox.pin.mutationOptions({ onSuccess: refresh }));
}

/** The chat stops waiting for a reply (an answer given by phone, say). */
export function useMarkAnswered() {
  const trpc = useTRPC();
  const refresh = useRefreshChat();
  return useMutation(trpc.inbox.markAnswered.mutationOptions({ onSuccess: refresh }));
}

export function useArchive() {
  const trpc = useTRPC();
  const refresh = useRefreshChat();
  return useMutation(trpc.inbox.archive.mutationOptions({ onSuccess: refresh }));
}

/** Clears the member's unread count for a chat: the list's row and the count above it. */
export function useMarkRead() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  return useMutation(
    trpc.inbox.markRead.mutationOptions({ onSuccess: () => Promise.all([invalidate("chats"), invalidate("summary")]) }),
  );
}

/** The agency's tags changed: the tag list, and the chats that carry tags. */
function useRefreshTags() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.inbox.tags.pathKey() }),
      invalidate("chats"),
      invalidate("chat"),
    ]);
}

export function useCreateTag() {
  const trpc = useTRPC();
  const refresh = useRefreshTags();
  return useMutation(trpc.inbox.createTag.mutationOptions({ onSuccess: refresh }));
}

export function useDeleteTag() {
  const trpc = useTRPC();
  const refresh = useRefreshTags();
  return useMutation(trpc.inbox.deleteTag.mutationOptions({ onSuccess: refresh }));
}

export function useSaveQuickReply() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.inbox.quickReplies.pathKey() });
  return {
    create: useMutation(trpc.inbox.createQuickReply.mutationOptions({ onSuccess: refresh })),
    update: useMutation(trpc.inbox.updateQuickReply.mutationOptions({ onSuccess: refresh })),
    remove: useMutation(trpc.inbox.deleteQuickReply.mutationOptions({ onSuccess: refresh })),
  };
}

/** Who may write the agency's tags and quick replies: whoever writes its templates. */
export function useMayCurate() {
  return useHolds("inbox:templates");
}
