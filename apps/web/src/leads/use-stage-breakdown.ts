"use client";

// Leads by stage for a period (leads.stageBreakdown): Home's "leads by stage" card.
import type { Period } from "@travel-crm/contracts/kernel";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useStageBreakdown(period: Period) {
  const trpc = useTRPC();
  return useQuery(trpc.leads.stageBreakdown.queryOptions({ period }));
}
