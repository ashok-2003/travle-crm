"use client";

// Reports' reads: the period's report and one staff member's, kept on screen while another period loads.
import type { DashboardRange } from "@travel-crm/contracts/insights";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSalesReport(range: DashboardRange) {
  const trpc = useTRPC();
  return useQuery(trpc.reports.overview.queryOptions({ range }, { placeholderData: (shown) => shown }));
}

export function useStaffReport(userId: string, range: DashboardRange) {
  const trpc = useTRPC();
  return useQuery(trpc.reports.staff.queryOptions({ userId, range }, { placeholderData: (shown) => shown }));
}

/** A share as a whole percent ("42%"), or "–" with nothing to share. */
export const percentOf = (part: number, whole: number) =>
  whole === 0 ? "–" : `${String(Math.round((part * 100) / whole))}%`;
