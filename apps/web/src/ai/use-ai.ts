"use client";

// Suggest reply's reads and changes: whether the composer offers the button, the agency's settings and the draft itself.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";

/** Whether the composer offers Suggest reply: the plan has the module, the role the permission, the agency switched it on. */
export function useSuggestReplyAvailable(): boolean {
  const trpc = useTRPC();
  const modules = useSubscription().data?.modules;
  const mayAsk = useHolds("ai:suggest") && (modules?.includes("ai") ?? false);
  const status = useQuery({ ...trpc.ai.status.queryOptions(), enabled: mayAsk, staleTime: 60_000 });
  return mayAsk && status.data?.enabled === true;
}

export function useSuggestReply() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.suggestReply.mutationOptions());
}

export function useAiSettings() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.settings.queryOptions());
}

export function useSaveAiSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.ai.saveSettings.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.ai.pathKey() }),
    }),
  );
}
