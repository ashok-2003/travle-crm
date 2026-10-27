"use client";

// Sales execution's reads and changes: the automation settings, the hot leads to call now, and one lead's heat and
// follow-ups. A change loads again what shows it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSalesAutomation() {
  const trpc = useTRPC();
  return useQuery(trpc.sales.settings.queryOptions());
}

export function useSaveSalesAutomation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.sales.saveSettings.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.sales.pathKey() }),
    }),
  );
}

export function useHotLeads() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.sales.hotLeads.queryOptions(), staleTime: 60_000 });
}

export function useLeadSales(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.sales.forLead.queryOptions({ leadId }));
}

export function useSetFollowUps() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.sales.setFollowUps.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.sales.pathKey() }),
    }),
  );
}
