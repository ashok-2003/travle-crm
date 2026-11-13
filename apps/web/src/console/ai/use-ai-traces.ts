"use client";

// An organization's kept AI turns a page at a time (aiTransparency.traces), newest first; one chat's when given.
import { useQueryClient } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

export const AI_TRACES_PER_PAGE = 50;

export function useAiTraces(organizationId: string, conversationId: string | null) {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  const queryClient = useQueryClient();
  const input = {
    organizationId,
    ...(conversationId === null ? {} : { conversationId }),
    limit: AI_TRACES_PER_PAGE,
  };
  const queryKey = [...trpc.aiTransparency.traces.pathKey(), input];
  const pages = useCursorPages({
    queryKey,
    page: (cursor) => client.aiTransparency.traces.query({ ...input, ...(cursor === null ? {} : { cursor }) }),
    items: (page) => page.traces,
  });
  // Back to the first page, for a cursor whose turn has been deleted since.
  return { ...pages, restart: () => queryClient.resetQueries({ queryKey }) };
}
