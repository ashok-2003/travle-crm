"use client";

// The lead list's search (W1): a customer's name or phone, so never in the address, where a page request, Next's own
// fetches and the Referer would carry it to the access logs. The screen holds it, and the tab keeps it (tab-storage.ts)
// so the way back from a lead, or a reload, finds it again; a sign-out wipes it with the rest. The search the api
// takes is trimmed; a blank is no search.
import { listLeadsInput } from "@travel-crm/contracts/crm";
import { useCallback, useState } from "react";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

const KEY = "leads.search";
const searchText = listLeadsInput.shape.search.unwrap();

/** What a kept search is worth to the api: itself, trimmed, or nothing when the api would refuse it. */
function usable(text: string | null): string {
  const parsed = searchText.safeParse(text);
  return parsed.success ? parsed.data : "";
}

export function useListSearch(): [search: string, setSearch: (text: string) => void] {
  const [search, setSearch] = useState(() => usable(readTabValue(KEY)));
  const change = useCallback((text: string) => {
    const next = usable(text);
    setSearch(next);
    keepTabValue(KEY, next);
  }, []);
  return [search, change];
}
