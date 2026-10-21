"use client";

// The sheets as their screens follow them: leadSheets.list asked again every 30 seconds while the page is open, one
// sheet asked again every 2 seconds while a check runs or its first rows are read, else every 30 (S37), and the one
// refresh every screen of them uses.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";

export const sheetListRefetch = 30_000;

/** Fast while the worker reads (a check runs, or the sheet's first rows are being read); otherwise every 30 seconds. */
export function leadSheetRefetchInterval(detail: SheetDetail | undefined): 2000 | 30000 | false {
  if (detail === undefined) return false;
  if (detail.checkRunning || (detail.status === "connecting" && detail.step === "done")) return 2000;
  return 30_000;
}

export function useLeadSheets() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.leadSheets.list.queryOptions(), refetchInterval: sheetListRefetch });
}

export function useLeadSheet(sheetId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.leadSheets.get.queryOptions({ sheetId }),
    refetchInterval: (query) => leadSheetRefetchInterval(query.state.data),
  });
}

/** Loads leadSheets.* again: the list, the sheet and its problems. */
export function useRefreshLeadSheets(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: trpc.leadSheets.pathKey() }), [trpc, queryClient]);
}
