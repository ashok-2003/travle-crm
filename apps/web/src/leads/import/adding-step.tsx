"use client";

// Step 4 while the worker adds (spec 3.2 step 4, B26, B28): the bar with "642 of 1,157 rows" and the time left, that
// the person may leave ("we'll tell you when it's done"), and Stop, which asks first. Stop finishes the batch under way:
// the rows already added stay, and the rest are in the report as "Stopped before this row".
import { useMutation } from "@tanstack/react-query";
import type { ImportDetail } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { ImportProgress } from "@/imports/import-progress";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { useMe } from "@/session/me-context";
import { rowsToBeAdded } from "./check-step";
import { useRefreshLeadImports } from "./use-lead-import";

export function AddingStep({ detail }: { detail: ImportDetail }) {
  const t = useTranslations("leads.import");
  const me = useMe();
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
      <PageHeader title={t("adding.title")} intro={t("adding.from", { name: detail.fileName, person: me.user.name })} />
      <ImportStepCaption status={detail.status} />
      <ImportProgress
        // What the importer's choices will add: rows they left out are neither in the total nor counted as done.
        done={detail.progress.rowsAdded}
        total={
          detail.counts === null
            ? detail.progress.rowsToAdd
            : rowsToBeAdded(detail.counts, detail.progress.rowsToAdd, detail.choices)
        }
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
