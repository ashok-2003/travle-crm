"use client";

// The names of the people who can work leads (leads.owners), by user id, for the inbox's owner initials and the contact
// panel's Owner. A list that didn't load leaves the names out: the rows still read without them.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

export function useOwners() {
  const trpc = useTRPC();
  const mayView = useHolds("leads:view");
  const query = useQuery({ ...trpc.leads.owners.queryOptions(), enabled: mayView, staleTime: 5 * 60_000 });
  const names = new Map((query.data ?? []).map((owner) => [owner.userId, owner.name]));
  return {
    owners: query.data ?? [],
    nameOf: (userId: string | null) => (userId === null ? null : (names.get(userId) ?? null)),
  };
}
