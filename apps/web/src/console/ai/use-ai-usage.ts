"use client";

// The console's AI usage (aiUsage.overview), read again every minute, and its calls a page at a time (aiUsage.calls),
// newest first, for every agency or one, all or only the failed.
import { useQuery } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

const READ_EVERY_MS = 60_000;
const CALLS_PER_PAGE = 50;

export function useAiOverview() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.aiUsage.overview.queryOptions(undefined, { refetchInterval: READ_EVERY_MS }));
}

export function useAiCalls(filter: { organizationId: string | null; failedOnly: boolean }) {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.aiUsage.calls.pathKey(), filter],
    page: (cursor) =>
      client.aiUsage.calls.query({
        limit: CALLS_PER_PAGE,
        failedOnly: filter.failedOnly,
        ...(filter.organizationId === null ? {} : { organizationId: filter.organizationId }),
        ...(cursor === null ? {} : { before: cursor }),
      }),
    items: (page) => page.calls,
  });
}
