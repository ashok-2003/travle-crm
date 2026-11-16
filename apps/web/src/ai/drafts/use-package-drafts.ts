"use client";

// The api side of drafting packages from the agency's documents: find the trips (one AI call), draft one (another), and
// save the checked draft as a package, which loads the packages again. The AI proposes; only the save writes.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useFindTrips() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.packageDrafts.find.mutationOptions());
}

export function useDraftPackage() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.packageDrafts.draft.mutationOptions());
}

export function useCreateGroupPackage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.ai.packageDrafts.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
    }),
  );
}
