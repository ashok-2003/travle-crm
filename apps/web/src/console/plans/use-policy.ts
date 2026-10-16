"use client";

// The subscription policy's calls: every platform staff member reads it, a super admin saves it. A save refreshes it
// and says so in a toast.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConsoleTRPC } from "../data/console-trpc";

export function usePolicy() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.plans.policy.queryOptions());
}

/** `onSaved` is the mutation's own, so the dialog closes whether or not its form is still on screen. */
export function useSetPolicy(onSaved: () => void) {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("consolePlatform.policy");
  return useMutation(
    trpc.plans.setPolicy.mutationOptions({
      onSuccess: () => {
        toast.success(t("saved"));
        onSaved();
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.plans.policy.queryKey() }),
    }),
  );
}
