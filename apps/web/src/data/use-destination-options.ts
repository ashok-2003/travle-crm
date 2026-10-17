"use client";

// The destinations a SearchCombobox offers (destinations.search): the agency's list alphabetically until something is
// typed, then those matching part of a name. Shared by the lead form's destination field and Settings' merge picker.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ComboboxSearch } from "@/components/search-combobox";
import { useTRPC } from "@/data/trpc";

const RESULTS = 20;

/** `without` is a destination never offered. Asks only while the picker is open. */
export function useDestinationOptions(search: ComboboxSearch, without?: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.destinations.search.queryOptions(
      { ...(search.query !== "" && { query: search.query }), limit: RESULTS },
      {
        enabled: search.open,
        placeholderData: keepPreviousData,
        select: (destinations) => destinations.filter((destination) => destination.id !== without),
      },
    ),
  );
}
