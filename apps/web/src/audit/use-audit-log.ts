"use client";

// The audit log a page at a time (audit.list, data/use-cursor-pages.ts), newest first, or one record's history: each
// page asks for the entries before the last one of the page before.
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";
import type { RecordFilter } from "./record-filter";

const AUDIT_ENTRIES_PER_PAGE = 25;

export function useAuditLog(record: RecordFilter | null) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const input = { ...record, limit: AUDIT_ENTRIES_PER_PAGE };
  return useCursorPages({
    queryKey: [...trpc.audit.list.pathKey(), input],
    page: (cursor) => client.audit.list.query({ ...input, ...(cursor === null ? {} : { before: cursor }) }),
    items: (page) => page.entries,
  });
}
