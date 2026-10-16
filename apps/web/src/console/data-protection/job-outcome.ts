"use client";

// What a purge's or an erasure's job did, read from the platform log once it is asked for: the newest result entry
// (deleted, erased, or kept and why) above the newest request, asked again every two seconds until there is one. Only
// answers the log gave after the request count, so an earlier request's result is never taken for this one's. A job
// that failed writes no result: after ten minutes the asking stops and the screen points to the failed jobs.
import { useQuery } from "@tanstack/react-query";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useEffect, useState } from "react";
import { useConsoleTRPC } from "../data/console-trpc";

const UNTIL_DONE_MS = 2000;
const GIVE_UP_MS = 10 * 60 * 1000;

/** The moment a request was made, by this device's clock, for `JobAwaited.since`. */
export const askedNow = (): number => Date.now();

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

export function useJobOutcome(awaited: JobAwaited): { outcome: PlatformLogEntry | null; gaveUp: boolean } {
  const trpc = useConsoleTRPC();
  const { since } = awaited;
  const [gaveUpSince, setGaveUpSince] = useState<number | null>(null);
  useEffect(() => {
    if (since === null) return;
    const timer = setTimeout(
      () => {
        setGaveUpSince(since);
      },
      Math.max(0, GIVE_UP_MS - (Date.now() - since)),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [since]);
  const stopped = since !== null && gaveUpSince === since;
  const log = useQuery({
    ...trpc.log.list.queryOptions({ targetOrganizationId: awaited.organizationId, limit: 20 }),
    enabled: since !== null,
    refetchInterval: (query) => {
      if (stopped) return false;
      const fresh = since !== null && query.state.dataUpdatedAt > since;
      return fresh && query.state.data && outcomeIn(query.state.data.entries, awaited) ? false : UNTIL_DONE_MS;
    },
  });
  const outcome =
    since === null || !log.data || log.dataUpdatedAt <= since ? null : outcomeIn(log.data.entries, awaited);
  return { outcome, gaveUp: stopped && outcome === null };
}
