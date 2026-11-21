"use client";

// A lead's timeline, a page at a time (leads.timeline, data/use-cursor-pages.ts), newest first, with the names its pages
// carry: for the Timeline card, and the Follow-ups card's last call, which reads the same query. Its pages are keyed under
// the procedure's path, so a change anywhere (a note, a follow-up done in Today) loads them again.
import type { PeopleNames } from "@travel-crm/contracts/crm";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

export function useTimeline(leadId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const pages = useCursorPages({
    queryKey: [...trpc.leads.timeline.pathKey(), { leadId }],
    page: (cursor) => client.leads.timeline.query({ leadId, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.entries,
  });
  const people = (pages.data?.pages ?? []).reduce<PeopleNames>((names, page) => ({ ...names, ...page.people }), {});
  return { ...pages, people };
}
