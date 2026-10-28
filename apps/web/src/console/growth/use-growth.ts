"use client";

// The console's growth reads and changes: the invites and their links, making and cancelling them, and the usage of
// every organization or one. Invites are read again each minute, since links are opened while the screen is open.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConsoleTRPC } from "../data/console-trpc";

export function useInvites() {
  const trpc = useConsoleTRPC();
  return useQuery({ ...trpc.invites.list.queryOptions(), refetchInterval: 60_000 });
}

export function useCreateInvites() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.invites.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.invites.pathKey() }),
    }),
  );
}

export function useCancelInvite() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.invites.cancel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.invites.pathKey() }),
    }),
  );
}

export function usePlansForSale() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.plans.list.queryOptions({ includeArchived: false }));
}

export function useUsageOverview() {
  const trpc = useConsoleTRPC();
  return useQuery({ ...trpc.usage.overview.queryOptions(), refetchInterval: 60_000 });
}

export function useOrganizationUsage(organizationId: string) {
  const trpc = useConsoleTRPC();
  return useQuery({ ...trpc.usage.organization.queryOptions({ organizationId }), refetchInterval: 60_000 });
}
