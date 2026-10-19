"use client";

// A lead import as its screens follow it (D37): leadImports.get, asked again every 2 seconds while the worker reads,
// checks or adds it, and the one refresh every step of it uses, so each screen shows the import as it is.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";
import { importRefetchInterval } from "@/imports/import-refetch";

export function useLeadImport(importId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.leadImports.get.queryOptions({ importId }),
    refetchInterval: (query) => importRefetchInterval(query.state.data),
  });
}

/** Loads leadImports.* again: the import, its example rows and Recent imports. */
export function useRefreshLeadImports(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.leadImports.pathKey() }),
    [trpc, queryClient],
  );
}
