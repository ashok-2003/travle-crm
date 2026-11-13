"use client";

// The AI's reads and changes: whether the composer offers Suggest reply, the agency's settings and knowledge, the draft itself, and a lead's insight.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";

/** How long the agency's AI switch is kept before it is asked again; Settings, AI refreshes it when it changes. */
const AI_STATUS_STALE = 5 * 60_000;

export type AiAvailability = "off" | "loading" | "on";

/**
 * Whether the AI's buttons are offered: the role holds ai:suggest, the plan has the module, the agency switched it on.
 * "loading" while the plan or the switch is not known yet, so a screen can keep the button's place and nothing moves when it
 * arrives. The app shell asks for the switch as soon as the plan says `ai` (AiStatusPrefetch), and a saved copy answers at once.
 */
export function useAiAvailability(): AiAvailability {
  const trpc = useTRPC();
  const holds = useHolds("ai:suggest");
  const modules = useSubscription().data?.modules;
  const mayAsk = holds && (modules?.includes("ai") ?? false);
  const status = useQuery({ ...trpc.ai.status.queryOptions(), enabled: mayAsk, staleTime: AI_STATUS_STALE });
  if (!holds) return "off";
  if (modules === undefined) return "loading";
  if (!mayAsk) return "off";
  if (status.data === undefined) return status.isError ? "off" : "loading";
  return status.data.enabled ? "on" : "off";
}

/** Whether the composer offers Suggest reply and the other AI buttons. */
export function useSuggestReplyAvailable(): boolean {
  return useAiAvailability() === "on";
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

export function useAiOverview() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.ai.overview.queryOptions(), staleTime: 30_000 });
}

export function useTestAi() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.test.mutationOptions());
}

/** A chat's autopilot state, read again while the AI is working on it. */
export function useChatAi(conversationId: string) {
  const trpc = useTRPC();
  const modules = useSubscription().data?.modules;
  const enabled = useHolds("ai:suggest") && (modules?.includes("ai") ?? false);
  return useQuery({
    ...trpc.ai.chatAi.queryOptions({ conversationId }),
    enabled,
    // Where the AI answers, look every few seconds: its "typing" shows as it starts and its answer as it ends.
    refetchInterval: (query) => (query.state.data?.answering === true ? 2_500 : 20_000),
  });
}

function useChatAiChange(conversationId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.ai.chatAi.queryKey({ conversationId }) });
}

export function useSetChatAi(conversationId: string) {
  const trpc = useTRPC();
  return useMutation(trpc.ai.setChatMode.mutationOptions({ onSuccess: useChatAiChange(conversationId) }));
}

export function useResumeChatAi(conversationId: string) {
  const trpc = useTRPC();
  return useMutation(trpc.ai.resumeChat.mutationOptions({ onSuccess: useChatAiChange(conversationId) }));
}

/** What the AI filled in on a new lead from its first messages and nobody has confirmed: only where the member and the plan have the AI. */
export function useLeadAiFields(leadId: string) {
  const trpc = useTRPC();
  const modules = useSubscription().data?.modules;
  const enabled = useHolds("ai:suggest") && (modules?.includes("ai") ?? false);
  return useQuery({ ...trpc.ai.leadFields.queryOptions({ leadId }), enabled, staleTime: 15_000 });
}

/** Confirm keeps the AI's values; dismiss clears what is still the AI's. The lead and its suggestions load again. */
export function useDecideLeadAiFields(leadId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshWork();
  return useMutation(
    trpc.ai.decideLeadFields.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          refresh(),
          queryClient.invalidateQueries({ queryKey: trpc.ai.leadFields.queryKey({ leadId }) }),
        ]);
      },
    }),
  );
}

/** The AI's open suggestion to mark a lead Lost or Not a lead, for the alert on the lead's page. */
export function useLeadStageSuggestion(leadId: string) {
  const trpc = useTRPC();
  const holds = useHolds("leads:view");
  return useQuery({ ...trpc.ai.leadStageSuggestion.queryOptions({ leadId }), enabled: holds, staleTime: 15_000 });
}

/**
 * A person's yes or no. The lead, its lists and every place the suggestion shows load again, and so does the chats' AI
 * state, so an open inbox card reads its chat afresh (the suggestion doesn't name the chat, so every chat's).
 */
export function useDecideStageSuggestion() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshWork();
  return useMutation(
    trpc.ai.decideStageSuggestion.mutationOptions({
      onSuccess: () =>
        Promise.all([
          refresh(),
          queryClient.invalidateQueries({ queryKey: trpc.ai.leadStageSuggestion.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.ai.stageSuggestions.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.ai.chatAi.pathKey() }),
        ]),
    }),
  );
}
