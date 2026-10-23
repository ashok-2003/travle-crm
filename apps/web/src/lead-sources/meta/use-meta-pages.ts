"use client";

// The Facebook Pages as their screens follow them: metaLeads.list asked again every 30 seconds while the page is open, one
// Page asked again every 2 seconds while a check runs, else every 30, and the one refresh every screen of them uses.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MetaPageDetail } from "@travel-crm/contracts/meta-leads";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";

const slowRefetch = 30_000;

/** Fast while the worker reads (a check runs); otherwise every 30 seconds. */
export function metaPageRefetchInterval(detail: MetaPageDetail | undefined): 2000 | 30000 | false {
  if (detail === undefined) return false;
  return detail.checkRunning ? 2000 : slowRefetch;
}

export function useMetaPages() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.metaLeads.list.queryOptions(), refetchInterval: slowRefetch });
}

export function useMetaPage(pageId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.metaLeads.get.queryOptions({ pageId }),
    refetchInterval: (query) => metaPageRefetchInterval(query.state.data),
  });
}

/** Loads metaLeads.* again: the list, the Page, its forms and its problems. */
export function useRefreshMeta(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: trpc.metaLeads.pathKey() }), [trpc, queryClient]);
}
