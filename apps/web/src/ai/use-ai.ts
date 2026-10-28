"use client";

// The AI's reads and changes: whether the composer offers Suggest reply, the agency's settings and knowledge, the draft itself, and a lead's insight.
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

/** What the agency told its AI to know; read again while a document's words are being read. */
export function useAiKnowledge() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.ai.knowledge.queryOptions(),
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === "reading") === true ? 3000 : false),
  });
}

function useKnowledgeChange() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.ai.knowledge.pathKey() });
}

export function useAddKnowledge() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.addKnowledge.mutationOptions({ onSuccess: useKnowledgeChange() }));
}

export function useUpdateKnowledge() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.updateKnowledge.mutationOptions({ onSuccess: useKnowledgeChange() }));
}

export function useDeleteKnowledge() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.deleteKnowledge.mutationOptions({ onSuccess: useKnowledgeChange() }));
}

export function useRequestDocument() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.requestKnowledgeDocument.mutationOptions());
}

export function useConfirmDocument() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.confirmKnowledgeDocument.mutationOptions({ onSuccess: useKnowledgeChange() }));
}

/** The AI's guess of how a lead will go, for its page: only where the member and the plan have the AI. */
export function useLeadInsight(leadId: string) {
  const trpc = useTRPC();
  const modules = useSubscription().data?.modules;
  const enabled = useHolds("ai:suggest") && (modules?.includes("ai") ?? false);
  return useQuery({ ...trpc.ai.leadInsight.queryOptions({ leadId }), enabled, staleTime: 30_000 });
}
