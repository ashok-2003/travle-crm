"use client";

// After a follow-up or task changes (done, snoozed), what shows it loads again: Today, and the lead's page, list and
// timeline. Lists keyed under their procedure's path (`[...trpc.leads.list.pathKey(), input]`) are reached too.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";

export function useRefreshWork(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [trpc.today.pathKey(), trpc.leads.get.pathKey(), trpc.leads.list.pathKey(), trpc.leads.timeline.pathKey()].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [trpc, queryClient],
  );
}
