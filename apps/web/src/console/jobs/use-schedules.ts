"use client";

// The schedules pg-boss holds (jobs.schedules), and a super admin's removal of one a job left behind, which refreshes
// them and says so in a toast.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConsoleTRPC } from "../data/console-trpc";

export function useSchedules() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.jobs.schedules.queryOptions());
}

export function useRemoveSchedule(onRemoved: () => void) {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("consolePlatform.schedules");
  return useMutation(
    trpc.jobs.unschedule.mutationOptions({
      onSuccess: (_answer, { queue }) => {
        toast.success(t("removed", { queue }));
        onRemoved();
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.jobs.schedules.queryKey() }),
    }),
  );
}
