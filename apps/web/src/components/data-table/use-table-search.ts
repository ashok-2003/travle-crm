"use client";

// A list's search (W1): a customer's name or phone, so never in the address, where a page request, Next's own fetches and
// the Referer would carry it to the access logs. The screen holds it, and the tab keeps it under the list's key
// (tab-storage.ts), so the way back from a record, or a reload, finds it again; a sign-out wipes it with the rest. The
// search the api takes is what its schema makes of the text (trimmed); a blank, or one it refuses, is no search.
import { useCallback, useState } from "react";
import type { z } from "zod";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

export function useTableSearch(
  key: string,
  schema: z.ZodType<string, string>,
): [search: string, setSearch: (text: string) => void] {
  const usable = useCallback(
    (text: string | null) => {
      const parsed = schema.safeParse(text);
      return parsed.success ? parsed.data : "";
    },
    [schema],
  );
  const [search, setSearch] = useState(() => usable(readTabValue(key)));
  const change = useCallback(
    (text: string) => {
      const next = usable(text);
      setSearch(next);
      keepTabValue(key, next);
    },
    [key, usable],
  );
  return [search, change];
}
