"use client";

// The sales inbox's reads and changes (sales inbox spec, section 5): the agency's tags and quick replies, a chat's tags,
// pin and archive, and the read mark that clears a member's unread count. A change loads the inbox's lists again (they are
// keyed under inbox.*), so every row shows it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

export function useTags() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.tags.queryOptions(), staleTime: 60_000 });
}

export function useQuickReplies() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.inbox.quickReplies.queryOptions(), staleTime: 60_000 });
}

/** After any change here: the inbox's lists, the chat's header and the agency's tags and quick replies load again. */
function useRefreshInbox() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() });
}

export function useSetTags() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.setTags.mutationOptions({ onSuccess: refresh }));
}

export function usePin() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.pin.mutationOptions({ onSuccess: refresh }));
}

/** The chat stops waiting for a reply (an answer given by phone, say). */
export function useMarkAnswered() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.markAnswered.mutationOptions({ onSuccess: refresh }));
}

export function useArchive() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.archive.mutationOptions({ onSuccess: refresh }));
}

/** Clears the member's unread count for a chat; only the list needs to know. */
export function useMarkRead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.inbox.markRead.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.inbox.conversations.pathKey() }),
    }),
  );
}

export function useCreateTag() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.createTag.mutationOptions({ onSuccess: refresh }));
}

export function useDeleteTag() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
  return useMutation(trpc.inbox.deleteTag.mutationOptions({ onSuccess: refresh }));
}

export function useSaveQuickReply() {
  const trpc = useTRPC();
  const refresh = useRefreshInbox();
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
