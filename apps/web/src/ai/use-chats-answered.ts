"use client";

// The chats the AI answered in a period (ai.chatsAnswered), for Home's card: asked only of holders of ai:manage,
// which the api requires too.
import type { Period } from "@travel-crm/contracts/kernel";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

export function useChatsAnswered(period: Period) {
  const trpc = useTRPC();
  const enabled = useHolds("ai:manage");
  return useQuery({ ...trpc.ai.chatsAnswered.queryOptions({ period }), enabled, staleTime: 30_000 });
}
