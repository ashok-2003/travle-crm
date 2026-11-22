// A list read a page at a time, loaded again by its first page alone (inbox revamp spec, part 1 item 4): what the live
// stream touches is the newest end (a new message tops the chats and ends the chat), so the pages loaded further down
// are kept and not asked for again. The first page's items take their new place, and leave the later pages; items the
// first page no longer holds stay where they were (pushed down a place), until the minute's poll reads every page.
import type { InfiniteData } from "@tanstack/react-query";

interface Page {
  items: readonly { id: string }[];
  nextCursor: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The pages with `first` as their first: a page's records (the people it names) keep the old ones' too. */
export function withFirstPage<P extends Page>(
  data: InfiniteData<P, string | null>,
  first: P,
): InfiniteData<P, string | null> {
  const [old, ...rest] = data.pages;
  if (old === undefined || rest.length === 0) return { pages: [first], pageParams: data.pageParams.slice(0, 1) };
  const fresh = new Set(first.items.map((item) => item.id));
  const stillHere = <Item extends { id: string }>(items: readonly Item[]) =>
    items.filter((item) => !fresh.has(item.id));
  const fields = first as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...fields };
  for (const [key, value] of Object.entries(fields)) {
    const before = (old as unknown as Record<string, unknown>)[key];
    if (isRecord(value) && isRecord(before)) merged[key] = { ...before, ...value };
  }
  // The later pages were asked for after the old first page: its cursor stays theirs.
  const top = {
    ...merged,
    items: [...first.items, ...stillHere(old.items)],
    nextCursor: old.nextCursor,
  } as unknown as P;
  return {
    pages: [top, ...rest.map((page) => ({ ...page, items: stillHere(page.items) }))],
    pageParams: data.pageParams,
  };
}
