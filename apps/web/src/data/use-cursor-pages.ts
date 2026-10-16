"use client";

// A list a page at a time, by the api's cursor: the first page asks with none, and each next page with the
// `nextCursor` of the page before, until it is null. Called through the tRPC client rather than tRPC's
// infiniteQueryOptions, which adds a `direction` to the input that the api's strict inputs refuse. The caller names
// the cursor as its procedure does (`before`, `after` or `cursor`).
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";

type Options<TPage> = Partial<
  Pick<
    UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage>, QueryKey, string | null>,
    "enabled" | "refetchInterval"
  >
>;

export function useCursorPages<TPage extends { nextCursor: string | null }, TItem>({
  queryKey,
  page,
  items,
  ...options
}: {
  queryKey: QueryKey;
  /** Asks the api for the page after `cursor` (null: the first page). */
  page: (cursor: string | null) => Promise<TPage>;
  /** A page's items. */
  items: (page: TPage) => TItem[];
} & Options<TPage>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => page(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    ...options,
  });
  return { ...query, items: query.data?.pages.flatMap(items) };
}
