"use client";

// After any change to the agency's work (a lead added, moved, reassigned, edited or blocked; a follow-up or task added,
// done or snoozed; a contact unblocked; a destination renamed or merged), everything that shows it loads again: all of
// leads.* (the list and its chips' counts, a lead's page and timeline, the owner pickers, the new-lead form's contact
// warning), today.*, tasks.* (the Follow-ups screen), destinations.* (a destination added with a lead) and
// blockedContacts.*. Only what is on screen
// refetches; the rest is marked stale, so the breadth costs nothing that isn't shown. The one refresh every change uses.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";

export function useRefreshWork(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [
          trpc.leads.pathKey(),
          trpc.today.pathKey(),
          trpc.tasks.pathKey(),
          trpc.destinations.pathKey(),
          trpc.blockedContacts.pathKey(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    [trpc, queryClient],
  );
}
