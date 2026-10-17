"use client";

// The lead list a page at a time (leads.list, data/use-cursor-pages.ts), newest first: each page asks for the leads
// before the last one of the page before. Its pages are keyed under the procedure's path, so a change made anywhere
// (a stage moved, a task done) reaches them. The open leads' counts by stage are for the same view and filters.
import type { ListLeadsInput, PeopleNames } from "@travel-crm/contracts/crm";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

export function useLeads(input: ListLeadsInput) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const pages = useCursorPages({
    queryKey: [...trpc.leads.list.pathKey(), input],
    page: (cursor) => client.leads.list.query({ ...input, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.items,
  });
  // Each page names the owners it mentions; the list needs them all.
  const people = (pages.data?.pages ?? []).reduce<PeopleNames>((names, page) => ({ ...names, ...page.people }), {});
  return { ...pages, people };
}

/** Open leads by stage for the list's view and filters, whatever its stage. */
export function useLeadCounts(input: ListLeadsInput) {
  const trpc = useTRPC();
  const { view, ownerUserId, source, destinationId, tripType, search } = input;
  return useQuery(
    trpc.leads.counts.queryOptions({
      view,
      ...(ownerUserId && { ownerUserId }),
      ...(source && { source }),
      ...(destinationId && { destinationId }),
      ...(tripType && { tripType }),
      ...(search && { search }),
    }),
  );
}
