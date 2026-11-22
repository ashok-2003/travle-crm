"use client";

// What the AI needs from the signed-in member: the chats it handed over and the stage suggestions on their own leads. The
// api sends the newest 20 of each and how many wait in all: the count is every one waiting, never the rows sent.
import type { HandedOverChat, StageSuggestion } from "@travel-crm/contracts/ai";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

const noChats: HandedOverChat[] = [];
const noSuggestions: StageSuggestion[] = [];

/** Each part is asked only when the member holds its permission; a part they may not see counts as empty. */
export function useNeedsMe() {
  const trpc = useTRPC();
  const mayChats = useHolds("inbox:view");
  const maySuggestions = useHolds("leads:view");
  const chats = useQuery({ ...trpc.ai.handedOver.queryOptions({ mine: true }), enabled: mayChats, staleTime: 30_000 });
  const suggestions = useQuery({
    ...trpc.ai.stageSuggestions.queryOptions({ mine: true }),
    enabled: maySuggestions,
    staleTime: 30_000,
  });
  const handedOver = chats.data?.chats ?? noChats;
  const stageSuggestions = suggestions.data?.suggestions ?? noSuggestions;
  return {
    handedOver,
    suggestions: stageSuggestions,
    count: (chats.data?.total ?? 0) + (suggestions.data?.total ?? 0),
    isPending: (mayChats && chats.isPending) || (maySuggestions && suggestions.isPending),
    isError: chats.isError || suggestions.isError,
    error: chats.error ?? suggestions.error,
    refetch: () => {
      if (mayChats) void chats.refetch();
      if (maySuggestions) void suggestions.refetch();
    },
  };
}
