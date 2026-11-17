"use client";

// Today's data (spec 3.5): the summary (the agency's day, its counts and its top three) and each section a page at a
// time. Both are keyed under today.*, so useRefreshWork (data/use-refresh-work.ts) loads them again after a Done, a
// Snooze or a lead marked contacted.
import type { TodayItem, TodaySectionName } from "@travel-crm/contracts/today";
import { useQuery } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

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

/** The first few things in My tasks, in the order it shows them: overdue, then due today, then new leads. */
export function useMyTasksPreview(limit = 5): {
  items: TodayItem[] | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const trpc = useTRPC();
  // The api needs leads:view for every section, so a member without it never asks.
  const enabled = useHolds("leads:view");
  // Each section asks for no more than the preview shows; the keys sit under today.section, so a change reloads them.
  const overdue = useQuery({ ...trpc.today.section.queryOptions({ section: "overdue", limit }), enabled });
  const dueToday = useQuery({ ...trpc.today.section.queryOptions({ section: "due-today", limit }), enabled });
  const newLeads = useQuery({ ...trpc.today.section.queryOptions({ section: "new-leads", limit }), enabled });
  const parts = [overdue, dueToday, newLeads];
  const ready = overdue.data !== undefined && dueToday.data !== undefined && newLeads.data !== undefined;
  return {
    items: ready ? [...overdue.data.items, ...dueToday.data.items, ...newLeads.data.items].slice(0, limit) : undefined,
    isError: parts.some((part) => part.isError),
    error: parts.find((part) => part.isError)?.error,
    refetch: () => {
      for (const part of parts) if (part.isError) void part.refetch();
    },
  };
}
