"use client";

// The people who may own a lead (leads.owners), for the owner and assignee pickers: every lead worker for someone with
// leads:assign, only themselves otherwise. Names only.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useLeadOwners() {
  const trpc = useTRPC();
  return useQuery(trpc.leads.owners.queryOptions());
}
