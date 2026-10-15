"use client";

// The platform log a page at a time (log.list), newest first: each page asks for the entries before the last entry
// of the page before.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

export const LOG_ENTRIES_PER_PAGE = 50;

export function usePlatformLog() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  const query = useInfiniteQuery({
    queryKey: [...trpc.log.list.pathKey(), { limit: LOG_ENTRIES_PER_PAGE }],
    queryFn: ({ pageParam }) =>
      client.log.list.query({ limit: LOG_ENTRIES_PER_PAGE, ...(pageParam === null ? {} : { before: pageParam }) }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  return { ...query, entries: query.data?.pages.flatMap((page) => page.entries) };
}
