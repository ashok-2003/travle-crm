"use client";

// The lead list's search (W1): a customer's name or phone, kept in the tab, never the address (use-table-search.ts). The
// api takes two to 80 characters, trimmed; a blank is no search.
import { listLeadsInput } from "@travel-crm/contracts/crm";
import { useTableSearch } from "@/components/data-table/use-table-search";

const searchText = listLeadsInput.shape.search.unwrap();

export function useListSearch(): [search: string, setSearch: (text: string) => void] {
  return useTableSearch("leads.search", searchText);
}
