"use client";

// The templates' reads and what changes them (whatsappTemplates.*): one number's settings table (the main number's unless
// one is named), and the approved ones for the send dialog (the chat's number's when it names the chat). A change loads
// the lists again.
import type { SendableTemplatesInput } from "@travel-crm/contracts/inbox";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useTemplates(enabled = true, connectionId: string | null = null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.whatsappTemplates.list.queryOptions(connectionId === null ? undefined : { connectionId }),
    enabled,
    staleTime: 0,
  });
}

export function useSendableTemplates(enabled: boolean, input?: SendableTemplatesInput) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.whatsappTemplates.sendable.queryOptions(input), enabled, staleTime: 0 });
}

/** Loads every templates list again (and the chats, whose reply box depends on them). */
export function useRefreshTemplates(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.whatsappTemplates.pathKey() });
}

export function useTemplateActions() {
  const trpc = useTRPC();
  const refresh = useRefreshTemplates();
  const archive = useMutation(trpc.whatsappTemplates.archive.mutationOptions({ onSuccess: refresh }));
  const sync = useMutation(trpc.whatsappTemplates.refresh.mutationOptions({ onSuccess: refresh }));
  return { archive, sync };
}
