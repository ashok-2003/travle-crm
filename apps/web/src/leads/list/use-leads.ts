"use client";

// The lead list from leads.list, newest first, two ways. The Leads screen reads a numbered page at a time, with how
// many leads match on every page; while another page or size loads, the rows in view stay (keepPreviousData), so the
// table doesn't jump to a skeleton and back, and `isPlaceholderData` says so. The pipeline's columns read on with Show
// more (data/use-cursor-pages.ts): each page asks for the leads before the last one of the page before. Both are keyed
// under the procedure's path, so a change made anywhere (a stage moved, a task done) reaches them. The open leads'
// counts by stage are for the same view and filters.
import type { ListLeadsInput, PeopleNames } from "@travel-crm/contracts/crm";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

/** One numbered page of the list (input.page), with the total. */
export function useLeadPage(input: ListLeadsInput & { page: number }) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.leads.list.queryOptions(input), placeholderData: keepPreviousData });
}

/** The list a page at a time after a cursor, for Show more. */
export function useLeads(input: Omit<ListLeadsInput, "page">) {
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
  const { view, ownerUserId, source, destinationId, tripType, created, search } = input;
  return useQuery(
    trpc.leads.counts.queryOptions({
      view,
      ...(ownerUserId && { ownerUserId }),
      ...(source && { source }),
      ...(destinationId && { destinationId }),
      ...(tripType && { tripType }),
      ...(created && { created }),
      ...(search && { search }),
    }),
  );
}

/** How many leads wait in the Unassigned queue, for the tab's label; asked only for someone who assigns leads. */
export function useUnassignedCount(enabled: boolean) {
  const trpc = useTRPC();
  const counts = useQuery({ ...trpc.leads.counts.queryOptions({ view: "unassigned" }), enabled });
  return counts.data?.open ?? null;
}
