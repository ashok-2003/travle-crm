"use client";

// The api side of "Ask your reports": a question in words (one of the agency's monthly AI calls, a mutation), and a report of
// the fixed catalogue run again for another range or picked from the suggestions (no AI, no call).
import type { AskRange, ReportQueryId } from "@travel-crm/contracts/reports";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useSuggestReplyAvailable } from "@/ai/use-ai";

/** Whether to offer the Ask box: the plan has the AI, the agency turned it on, the role holds both permissions. */
export function useAskAvailable(): boolean {
  const aiOn = useSuggestReplyAvailable();
  const mayView = useHolds("leads:view");
  return aiOn && mayView;
}

export function useAskReport() {
  const trpc = useTRPC();
  return useMutation(trpc.reports.ask.mutationOptions());
}

export interface ReportChoice {
  queryId: ReportQueryId;
  range?: AskRange | undefined;
}

export function useRunReport(choice: ReportChoice | null) {
  const trpc = useTRPC();
  return useQuery(
    trpc.reports.run.queryOptions(choice ?? { queryId: "overview" }, {
      enabled: choice !== null,
      placeholderData: (shown) => shown,
    }),
  );
}
