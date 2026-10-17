"use client";

// The agency's destinations for Settings (destinations.search): alphabetically, the first 100 (the most the api lists
// at once), or those matching part of a name. After a rename or a merge they load again with the leads and Today, which
// show their destination's name (useRefreshWork, data/use-refresh-work.ts).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
