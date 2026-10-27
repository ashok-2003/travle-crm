"use client";

// The AI sales agent's reads and changes: its settings and knowledge, a chat's AI state and insight, a lead's insight,
// a suggested reply and a test question. A change loads again what shows it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

/** How often a chat's insight is read again while it is open: the agent rescores after each message. */
const CHAT_REFRESH_MS = 20_000;

function useAiChange() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.ai.pathKey() });
}

export function useAiSettings() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.settings.queryOptions());
}

export function useSaveAiSettings() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.saveSettings.mutationOptions({ onSuccess: changed }));
}

export function useAiKnowledge() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.ai.knowledge.queryOptions(),
    // A document's words are being read: look again until they are.
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === "reading") === true ? 3000 : false),
  });
}

export function useAddKnowledge() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.addKnowledge.mutationOptions({ onSuccess: changed }));
}

export function useUpdateKnowledge() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.updateKnowledge.mutationOptions({ onSuccess: changed }));
}

export function useDeleteKnowledge() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.deleteKnowledge.mutationOptions({ onSuccess: changed }));
}

export function useRequestDocument() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.requestDocument.mutationOptions());
}

export function useConfirmDocument() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.confirmDocument.mutationOptions({ onSuccess: changed }));
}

export function useTestAi() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.test.mutationOptions());
}

export function useChatAi(conversationId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.ai.forChat.queryOptions({ conversationId }), refetchInterval: CHAT_REFRESH_MS });
}

export function useSetChatAi() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.setChatMode.mutationOptions({ onSuccess: changed }));
}

export function useResumeChatAi() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.resume.mutationOptions({ onSuccess: changed }));
}

export function useSuggestReply() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.suggest.mutationOptions());
}

export function useLeadInsight(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.ai.forLead.queryOptions({ leadId }));
}
