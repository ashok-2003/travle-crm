"use client";

// The audit log a page at a time (audit.list), newest first, or one record's history: each page asks for the entries
// before the last one of the page before. Called through the client, as the console's dashboard is: tRPC's infinite
// queries add a `direction` to the input, which the api's strict input refuses.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import type { RecordFilter } from "./record-filter";

export const AUDIT_ENTRIES_PER_PAGE = 25;

export function useAuditLog(record: RecordFilter | null) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const input = { ...record, limit: AUDIT_ENTRIES_PER_PAGE };
  const query = useInfiniteQuery({
    queryKey: [...trpc.audit.list.pathKey(), input],
    queryFn: ({ pageParam }) =>
      client.audit.list.query({ ...input, ...(pageParam === null ? {} : { before: pageParam }) }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  return { ...query, entries: query.data?.pages.flatMap((page) => page.entries) };
}
