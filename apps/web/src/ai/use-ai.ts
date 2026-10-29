"use client";

// The AI sales agent's reads and changes: its settings and knowledge, its day at a glance and what it learned, a chat's
// AI state and insight, a lead's insight and bookings, the media it sends, a suggested reply and a test question. A
// change loads again what shows it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

/**
 * How often an open chat's AI state is read again: every few seconds where the agent answers, so its "typing" shows as it
 * starts and its answer as it ends; slower elsewhere, for the insight it rescores after each message.
 */
const CHAT_ANSWERING_MS = 2_500;
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
  return useQuery({
    ...trpc.ai.forChat.queryOptions({ conversationId }),
    refetchInterval: (query) => (query.state.data?.answering === true ? CHAT_ANSWERING_MS : CHAT_REFRESH_MS),
  });
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

/** The AI's last day at a glance; read again each minute while the screen is open. */
export function useAiOverview() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.ai.overview.queryOptions(), refetchInterval: 60_000 });
}

export function useAiLearnings() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.learnings.queryOptions());
}

export function useSetLearning() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.setLearning.mutationOptions({ onSuccess: changed }));
}

export function useLearnNow() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.learnNow.mutationOptions({ onSuccess: changed }));
}

/** A real person's way of talking: for the agency (no chat), or for one chat. */
export function useLearnVoice(conversationId: string | null) {
  const trpc = useTRPC();
  const changed = useAiChange();
  const agency = useMutation(trpc.ai.learnVoice.mutationOptions({ onSuccess: changed }));
  const chat = useMutation(trpc.ai.learnChatVoice.mutationOptions({ onSuccess: changed }));
  return conversationId === null
    ? {
        ...agency,
        learn: (input: { personName: string; messages: { own: boolean; text: string }[] }, onSuccess: () => void) => {
          agency.mutate(input, { onSuccess });
        },
      }
    : {
        ...chat,
        learn: (input: { personName: string; messages: { own: boolean; text: string }[] }, onSuccess: () => void) => {
          chat.mutate({ ...input, conversationId }, { onSuccess });
        },
      };
}

export function useSetChatPersona() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.setChatPersona.mutationOptions({ onSuccess: changed }));
}

export function useClearVoice(conversationId: string | null) {
  const trpc = useTRPC();
  const changed = useAiChange();
  const agency = useMutation(trpc.ai.clearVoice.mutationOptions({ onSuccess: changed }));
  const chat = useMutation(trpc.ai.clearChatVoice.mutationOptions({ onSuccess: changed }));
  return conversationId === null
    ? {
        ...agency,
        clear: () => {
          agency.mutate();
        },
      }
    : {
        ...chat,
        clear: () => {
          chat.mutate({ conversationId });
        },
      };
}

export function useLeadInsight(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.ai.forLead.queryOptions({ leadId }));
}

export function useAiMedia() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.media.queryOptions());
}

export function useRequestMedia() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.requestMedia.mutationOptions());
}

export function useConfirmMedia() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.confirmMedia.mutationOptions({ onSuccess: changed }));
}

export function useUpdateMedia() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.updateMedia.mutationOptions({ onSuccess: changed }));
}

export function useDeleteMedia() {
  const trpc = useTRPC();
  const changed = useAiChange();
  return useMutation(trpc.ai.deleteMedia.mutationOptions({ onSuccess: changed }));
}

/** The bookings the AI took on a lead, with the customer's payment proofs. */
export function useLeadBookings(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.ai.bookingsForLead.queryOptions({ leadId }));
}

/** A person decides a booking; the lead's own page loads again, since a confirmed one wins the lead. */
export function useSetBookingStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.ai.setBookingStatus.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.ai.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.leads.pathKey() }),
        ]),
    }),
  );
}
