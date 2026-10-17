"use client";

// A lead's page (leads.get) and the changes made from it: a stage moved, a lead reopened, reassigned or its contact
// blocked. Each change, once the api has it, loads again what shows the work (useRefreshWork: the lead's page and
// timeline, the list and its counts, Today, the blocked contacts), then says so; `onDone` (closing the dialog that
// asked) runs in the mutation's own options, so it lands even once the button that sent it is gone. Today's Mark
// contacted moves the stage through useMoveStage too.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { recordId } from "@travel-crm/contracts/identity";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useLead(leadId: string) {
  const trpc = useTRPC();
  const valid = recordId.safeParse(leadId).success;
  const lead = useQuery(trpc.leads.get.queryOptions(valid ? { leadId } : skipToken));
  return { ...lead, valid };
}

export function useMoveStage(onDone?: () => void) {
  const t = useTranslations("leads");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  return useMutation(
    trpc.leads.moveStage.mutationOptions({
      onSuccess: async (_, { stage }: { stage: LeadStage }) => {
        await refresh();
        toast.success(t("lead.moved", { stage: t(`stages.${stage}`) }));
        onDone?.();
      },
    }),
  );
}

export function useReopenLead() {
  const t = useTranslations("leads.lead");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  return useMutation(
    trpc.leads.reopen.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("reopened"));
      },
    }),
  );
}

export function useBlockContact(onDone: () => void) {
  const t = useTranslations("leads.lead");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  return useMutation(
    trpc.leads.block.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("block.done"));
        onDone();
      },
    }),
  );
}
