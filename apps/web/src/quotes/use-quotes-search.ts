"use client";

// The Quotes list's search: a customer's name, a phone or a trip. Never in the address (a name or phone in a URL reaches
// the access logs and the Referer): the screen holds it and the tab keeps it (tab-storage.ts), so a reload finds it again.
import { listQuotesInput } from "@travel-crm/contracts/quotes";
import { useCallback, useState } from "react";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

const KEY = "quotes.search";
const searchText = listQuotesInput.shape.search.unwrap();

/** What a kept search is worth to the api: itself, trimmed, or nothing when the api would refuse it. */
function usable(text: string | null): string {
  const parsed = searchText.safeParse(text?.trim());
  return parsed.success ? parsed.data : "";
}

export function useQuotesSearch(): [search: string, setSearch: (text: string) => void] {
  const [search, setSearch] = useState(() => usable(readTabValue(KEY)));
  const change = useCallback((text: string) => {
    const next = usable(text);
    setSearch(next);
    keepTabValue(KEY, next);
  }, []);
  return [search, change];
}
