"use client";

// The agency's destinations for Settings (destinations.search): alphabetically, the first 100 (the most the api lists
// at once), or those matching part of a name. After a rename or a merge, they load again, and so do the leads, which
// show their destination's name.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";

/** How many destinations Settings lists at once: destinations.search's most. */
export const LISTED = 100;

export function useDestinations(query = "") {
  const trpc = useTRPC();
  return useQuery(
    trpc.destinations.search.queryOptions(
      { ...(query === "" ? {} : { query }), limit: LISTED },
      { placeholderData: keepPreviousData },
    ),
  );
}

export function useRefreshDestinations(): () => Promise<unknown> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [trpc.destinations.pathKey(), trpc.leads.pathKey()].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [trpc, queryClient],
  );
}
