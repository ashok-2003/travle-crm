"use client";

// The broadcasts' reads and changes (broadcasts.*; sales inbox spec 6): the list and one broadcast's recipients, both looked at
// again every 15 seconds while open, since the worker sends in the background and the counts move. A change loads again only
// the broadcast lists.
import { INBOX_POLL_MS } from "@travel-crm/contracts/inbox";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

export function useBroadcastList() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.broadcasts.list.queryOptions(), refetchInterval: INBOX_POLL_MS, staleTime: 0 });
}

export function useBroadcastDetail(broadcastId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const pages = useCursorPages({
    queryKey: [...trpc.broadcasts.get.pathKey(), broadcastId],
    page: (cursor) => client.broadcasts.get.query({ broadcastId, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.recipients,
    refetchInterval: INBOX_POLL_MS,
    staleTime: 0,
  });
  return { ...pages, broadcast: pages.data?.pages[0]?.broadcast, people: pages.data?.pages[0]?.people ?? {} };
}

export function useBroadcastPreview() {
  const trpc = useTRPC();
  return useMutation(trpc.broadcasts.preview.mutationOptions());
}

function useRefreshBroadcasts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.broadcasts.pathKey() });
}

export function useCreateBroadcast(onCreated: (id: string) => void) {
  const trpc = useTRPC();
  const refresh = useRefreshBroadcasts();
  return useMutation(
    trpc.broadcasts.create.mutationOptions({
      onSuccess: async ({ id }) => {
        await refresh();
        onCreated(id);
      },
    }),
  );
}

export function useBroadcastControls(onCancelled: () => void) {
  const trpc = useTRPC();
  const refresh = useRefreshBroadcasts();
  return {
    cancel: useMutation(
      trpc.broadcasts.cancel.mutationOptions({
        onSuccess: async () => {
          await refresh();
          onCancelled();
        },
      }),
    ),
    resume: useMutation(trpc.broadcasts.resume.mutationOptions({ onSuccess: refresh })),
  };
}
