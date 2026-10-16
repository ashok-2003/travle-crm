"use client";

// The organization's issued documents a page at a time (documents.list, through useCursorPages), newest first. While
// the worker prepares a PDF, the list asks again until it is ready.
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { documentState, PREPARING_POLL_MS } from "./document-state";

const DOCUMENTS_PER_PAGE = 20;

export function useIssuedDocuments() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.documents.list.pathKey(), { limit: DOCUMENTS_PER_PAGE }],
    page: (cursor) =>
      client.documents.list.query({ limit: DOCUMENTS_PER_PAGE, ...(cursor === null ? {} : { cursor }) }),
    items: (page) => page.documents,
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) =>
        page.documents.some((document) => documentState(document) === "preparing"),
      )
        ? PREPARING_POLL_MS
        : false,
  });
}
