"use client";

// The platform log a page at a time (log.list), newest first: each page asks for the entries before the last entry
// of the page before.
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

const LOG_ENTRIES_PER_PAGE = 50;

export function usePlatformLog() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.log.list.pathKey(), { limit: LOG_ENTRIES_PER_PAGE }],
    page: (cursor) =>
      client.log.list.query({ limit: LOG_ENTRIES_PER_PAGE, ...(cursor === null ? {} : { before: cursor }) }),
    items: (page) => page.entries,
  });
}
