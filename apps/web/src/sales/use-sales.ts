"use client";

// Sales execution's reads: the hot leads to call now, and one lead's heat.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useHotLeads() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.sales.hotLeads.queryOptions(), staleTime: 60_000 });
}

export function useLeadSales(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.sales.forLead.queryOptions({ leadId }));
}
