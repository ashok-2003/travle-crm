"use client";

// The organization's issued documents a page at a time (documents.list), newest first: each page asks for those after
// the last document of the page before. While the worker prepares a PDF, the list asks again until it is ready.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { documentState, PREPARING_POLL_MS } from "./document-state";

export const DOCUMENTS_PER_PAGE = 20;

export function useIssuedDocuments() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  // By hand rather than tRPC's infiniteQueryOptions, which adds a `direction` the strict input refuses.
  const query = useInfiniteQuery({
    queryKey: [...trpc.documents.list.pathKey(), { limit: DOCUMENTS_PER_PAGE }],
    queryFn: ({ pageParam }) =>
      client.documents.list.query({
        limit: DOCUMENTS_PER_PAGE,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) =>
        page.documents.some((document) => documentState(document) === "preparing"),
      )
        ? PREPARING_POLL_MS
        : false,
  });
  return { ...query, documents: query.data?.pages.flatMap((page) => page.documents) };
}
