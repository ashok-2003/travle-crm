"use client";

// How many of the member's own follow-ups are due now (overdue and today), and how many of those the customer answered.
// The api needs leads:view, so a member without it never asks and gets undefined.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { replied } from "./next-move";

export function useFollowUpsDue(): { due: number; replied: number } | undefined {
  const trpc = useTRPC();
  const may = useHolds("leads:view");
  const { data } = useQuery({
    ...trpc.tasks.followUps.queryOptions({ view: "due", mine: true }),
    enabled: may,
    staleTime: 30_000,
  });
  if (!may || data === undefined) return undefined;
  return { due: data.rows.length, replied: data.rows.filter(replied).length };
}
