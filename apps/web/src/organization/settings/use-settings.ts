"use client";

// The two-factor requirement as a quick action (spec 11: optimistic updates): the switch moves at once and moves
// back if the api refuses. Settings and me.get, which carries the organization's requirement, are refreshed after.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSetTwoFactorRequirement() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settingsKey = trpc.settings.get.queryKey();
  return useMutation(
    trpc.settings.setTwoFactorRequirement.mutationOptions({
      onMutate: async ({ required }) => {
        await queryClient.cancelQueries({ queryKey: settingsKey });
        const before = queryClient.getQueryData(settingsKey);
        queryClient.setQueryData(settingsKey, { requireTwoFactor: required });
        return { before };
      },
      onError: (_error, _variables, onMutateResult) => {
        if (onMutateResult?.before) queryClient.setQueryData(settingsKey, onMutateResult.before);
      },
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: settingsKey }),
          queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() }),
        ]);
      },
    }),
  );
}
