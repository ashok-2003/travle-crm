"use client";

// What a purge's or an erasure's job did, read from the platform log once it is asked for: the newest result entry
// (deleted, erased, or kept and why) above the newest request, asked again every two seconds until there is one. Only
// answers the log gave after the request count, so an earlier request's result is never taken for this one's.
import { useQuery } from "@tanstack/react-query";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useConsoleTRPC } from "../data/console-trpc";

const UNTIL_DONE_MS = 2000;

export interface JobAwaited {
  organizationId: string;
  /** The log's action for the request, e.g. "organization.purge-requested". */
  requested: string;
  /** The log's actions for its results. */
  results: readonly string[];
  /** The record the job is about, for an erasure. */
  targetId?: string;
  /** When the request was made, by this device's clock; null until it is. */
  since: number | null;
}

export function outcomeIn(entries: PlatformLogEntry[], awaited: JobAwaited): PlatformLogEntry | null {
  for (const entry of entries) {
    if (awaited.targetId !== undefined && entry.targetId !== awaited.targetId) continue;
    if (awaited.results.includes(entry.action)) return entry;
    if (entry.action === awaited.requested) return null;
  }
  return null;
}

export function useJobOutcome(awaited: JobAwaited): PlatformLogEntry | null {
  const trpc = useConsoleTRPC();
  const { since } = awaited;
  const log = useQuery({
    ...trpc.log.list.queryOptions({ targetOrganizationId: awaited.organizationId, limit: 20 }),
    enabled: since !== null,
    refetchInterval: (query) => {
      const fresh = since !== null && query.state.dataUpdatedAt > since;
      return fresh && query.state.data && outcomeIn(query.state.data.entries, awaited) ? false : UNTIL_DONE_MS;
    },
  });
  if (since === null || !log.data || log.dataUpdatedAt <= since) return null;
  return outcomeIn(log.data.entries, awaited);
}
