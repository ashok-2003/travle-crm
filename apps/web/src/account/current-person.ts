"use client";

// For the screens outside the app shell that still need a signed-in person (changing a password, setting up
// two-factor): who they are, from me.get, and where they go once a step is done, by what the api still asks of them.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";
import { pendingStepRoute, routes } from "@/lib/routes";

export function useCurrentPerson() {
  const trpc = useTRPC();
  return useQuery(trpc.me.get.queryOptions());
}

/** Asks me.get again, then opens the next pending step or, with none left, the home screen. */
export function useContinueAfterStep(): () => Promise<void> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    const me = await queryClient.query({ ...trpc.me.get.queryOptions(), staleTime: 0 });
    router.replace(me.pendingStep ? pendingStepRoute(me.pendingStep) : routes.home);
  }, [trpc, queryClient, router]);
}
