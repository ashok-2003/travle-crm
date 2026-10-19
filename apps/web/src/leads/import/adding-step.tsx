"use client";

// Step 4 while the worker adds (spec 3.2 step 4, B26, B28): the bar with "642 of 1,157 rows" and the time left, that
// the person may leave ("we'll tell you when it's done"), and Stop, which asks first. Stop finishes the batch under way:
// the rows already added stay, and the rest are in the report as "Stopped before this row".
import { useMutation } from "@tanstack/react-query";
import type { ImportCounts, ImportDetail } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { ImportProgress } from "@/imports/import-progress";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { useRefreshLeadImports } from "./use-lead-import";

/** Every row the add takes a decision on: those it adds and those the importer's choices may leave out. */
export function rowsInTheAdd(counts: ImportCounts | null, rowsToAdd: number): number {
  if (counts === null) return rowsToAdd;
  const { byPlan } = counts;
  return byPlan.new + byPlan.returning + byPlan.enquiry + byPlan.blocked + byPlan.already_imported + byPlan.in_crm;
}

export function AddingStep({ detail }: { detail: ImportDetail }) {
  const t = useTranslations("leads.import");
  const trpc = useTRPC();
  const refresh = useRefreshLeadImports();
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const stop = useMutation(
    trpc.leadImports.stop.mutationOptions({
      onSuccess: async () => {
        setAsked(true);
        setAsking(false);
        await refresh();
      },
    }),
  );
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("adding.title")} intro={t("adding.from", { name: detail.fileName })} />
      <ImportStepCaption status={detail.status} />
      <ImportProgress
        done={detail.progress.rowsDone}
        total={rowsInTheAdd(detail.counts, detail.progress.rowsToAdd)}
        since={detail.progress.addRequestedAt}
        label={t("adding.label")}
      />
      <p className="text-muted-foreground">{asked ? t("adding.stopping") : t("adding.leave")}</p>
      <Button
        variant="outline"
        className="self-start"
        disabled={asked}
        onClick={() => {
          setAsking(true);
        }}
      >
        {t("adding.stop")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("adding.stopTitle")}
        description={t("adding.stopBody")}
        action={t("adding.stopAction")}
        request={stop}
        onConfirm={() => {
          stop.mutate({ importId: detail.id });
        }}
      />
    </div>
  );
}
