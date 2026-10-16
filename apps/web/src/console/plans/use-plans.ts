"use client";

// The plans screen's calls. Each change refreshes every list of plans the console holds (this screen's, with the
// archived ones, and onboarding's, on sale only), and says so in a toast from the hook itself, so it doesn't depend on
// the dialog that asked still being open.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConsoleTRPC } from "../data/console-trpc";

export function usePlans() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.plans.list.queryOptions({ includeArchived: true }));
}

function useRefreshPlans() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.plans.list.pathKey() });
}

/** `onSaved` is the mutation's own, so the dialog closes whether or not the form that asked is still on screen. */
export function useCreatePlan(onSaved: () => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshPlans();
  const t = useTranslations("consolePlatform.plans");
  return useMutation(
    trpc.plans.create.mutationOptions({
      onSuccess: (plan) => {
        toast.success(t("created", { name: plan.name }));
        onSaved();
      },
      onSettled: refresh,
    }),
  );
}

export function useUpdatePlan(onSaved: () => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshPlans();
  const t = useTranslations("consolePlatform.plans");
  return useMutation(
    trpc.plans.update.mutationOptions({
      onSuccess: (plan) => {
        toast.success(t("saved", { name: plan.name }));
        onSaved();
      },
      onSettled: refresh,
    }),
  );
}

export function useArchivePlan(onArchived: () => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshPlans();
  const t = useTranslations("consolePlatform.plans");
  return useMutation(
    trpc.plans.archive.mutationOptions({
      onSuccess: (plan) => {
        toast.success(t("archivedToast", { name: plan.name }));
        onArchived();
      },
      onSettled: refresh,
    }),
  );
}
