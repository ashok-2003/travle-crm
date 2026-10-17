"use client";

// Today's data (spec 3.5): the summary (the agency's day, its counts and its top three) and each section a page at a
// time. Both are keyed under today.*, so useRefreshWork (data/use-refresh-work.ts) loads them again after a Done, a
// Snooze or a lead marked contacted.
import type { TodaySectionName } from "@travel-crm/contracts/today";
import { useQuery } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";

export function useTodaySummary() {
  const trpc = useTRPC();
  return useQuery(trpc.today.summary.queryOptions());
}

export function useTodaySection(section: TodaySectionName) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.today.section.pathKey(), { section }],
    page: (cursor) => client.today.section.query({ section, ...(cursor === null ? {} : { after: cursor }) }),
    items: (page) => page.items,
  });
}
