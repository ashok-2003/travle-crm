"use client";

// The failed-jobs list a page at a time (jobs.failed), newest first, optionally one queue's: each page asks for the
// jobs after the last job of the page before. Running one again refreshes the list and says so in a toast, from the
// hook itself, so it doesn't depend on the job's row still being there.
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FailedJobsCursor } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

export const FAILED_JOBS_PER_PAGE = 25;

export function useFailedJobs(queue: string | null) {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  const query = useInfiniteQuery({
    queryKey: [...trpc.jobs.failed.pathKey(), { limit: FAILED_JOBS_PER_PAGE, queue }],
    queryFn: ({ pageParam }) =>
      client.jobs.failed.query({
        limit: FAILED_JOBS_PER_PAGE,
        ...(queue === null ? {} : { queue }),
        ...(pageParam === null ? {} : { after: pageParam }),
      }),
    initialPageParam: null as FailedJobsCursor | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  return { ...query, jobs: query.data?.pages.flatMap((page) => page.jobs) };
}

export function useRetryJob() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const { apiError } = useErrorMessage();
  const t = useTranslations("consolePlatform.jobs");
  return useMutation(
    trpc.jobs.retry.mutationOptions({
      onSuccess: () => {
        toast.success(t("retried"));
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.jobs.failed.pathKey() }),
    }),
  );
}
