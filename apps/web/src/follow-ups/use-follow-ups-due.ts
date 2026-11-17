"use client";

// How many of the member's own follow-ups are due now (overdue and today), and how many of those the customer answered.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { replied } from "./next-move";

export function useFollowUpsDue(): { due: number; replied: number } | undefined {
  const trpc = useTRPC();
  const { data } = useQuery({ ...trpc.tasks.followUps.queryOptions({ view: "due", mine: true }), staleTime: 30_000 });
  if (data === undefined) return undefined;
  return { due: data.rows.length, replied: data.rows.filter(replied).length };
}
