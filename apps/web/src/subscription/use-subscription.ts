"use client";

// What the member's organization's subscription allows today (subscription.get, spec 7.3): its status and access,
// plan, modules, dates and limits, with no price. Open in every state, so screens can say why something is refused.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSubscription() {
  const trpc = useTRPC();
  return useQuery(trpc.subscription.get.queryOptions());
}
