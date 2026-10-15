"use client";

// The person's choice of what reaches them (spec 9.4), and changing one as a quick action (spec 11): the switch moves
// at once, and moves back with the reason if the change fails.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";

export function usePreferences() {
  const trpc = useTRPC();
  return useQuery(trpc.notifications.preferences.list.queryOptions());
}

export function useSetPreference() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { apiError } = useErrorMessage();
  const listKey = trpc.notifications.preferences.list.queryKey();
  return useMutation(
    trpc.notifications.preferences.set.mutationOptions({
      onMutate: async (choice) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const before = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (choices = []) => [
          ...choices.filter(({ channel, kind }) => channel !== choice.channel || kind !== choice.kind),
          choice,
        ]);
        return { before };
      },
      onError: (error, _choice, onMutateResult) => {
        if (onMutateResult) queryClient.setQueryData(listKey, onMutateResult.before);
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );
}
