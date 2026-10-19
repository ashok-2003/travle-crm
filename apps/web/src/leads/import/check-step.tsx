"use client";

// Step 3 (spec 3.2): the worker checks every row (a dry run, B25) while a bar moves, then the preview says what will
// happen to each: what will be added, your choice, what won't be, the destinations it adds, and a quiet line when many
// leads will be New. Add asks once; Change the columns goes back to step 2; Cancel this import ends it. For a Google
// Sheet's import it says where the rows came from and asks the stage rows with none get (the Sheets sync, N8).
import { useMutation } from "@tanstack/react-query";
import type { ImportCounts, ImportDetail } from "@travel-crm/contracts/imports";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/data/trpc";
import { ImportProgress } from "@/imports/import-progress";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { CheckChoices } from "./check-choices";
import { StageQuestion } from "./lead-file-questions";
import { leadFieldOf } from "./lead-import-fields";
import { NotAddedGroup } from "./not-added-group";
import { useRefreshLeadImports } from "./use-lead-import";

/** Many leads on New is worth a line (B12): this many or more. */
const MANY_NEW = 20;
const MAX_DESTINATIONS_SHOWN = 10;

function NewDestinations({ names }: { names: readonly string[] }) {
  const t = useTranslations("leads.import.check");
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_DESTINATIONS_SHOWN);
  const more = names.length - shown.length;
  const list = more > 0 ? [...shown, t("andMoreDestinations", { count: formatCount(more) })] : shown;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="new-destinations">
      <h2 id="new-destinations" className="text-section font-semibold">
        {t("newDestinations")} · <span className="numbers">{formatCount(names.length)}</span>
      </h2>
      <p className="text-muted-foreground">
        {t("newDestinationsBody", { names: new Intl.ListFormat("en-IN", { type: "conjunction" }).format(list) })}
      </p>
    </section>
  );
}

/** The rows the add takes: what will be added, and the rows of each choice the importer ticked. */
export function rowsToBeAdded(counts: ImportCounts, rowsToAdd: number, choices: ImportDetail["choices"]): number {
  return (
    rowsToAdd +
    (choices.addBlocked ? counts.byPlan.blocked : 0) +
    (choices.addAlreadyImported ? counts.byPlan.already_imported : 0) +
    (choices.addInCrm ? counts.byPlan.in_crm : 0)
  );
}

export function CheckStep({ detail, onChangeColumns }: { detail: ImportDetail; onChangeColumns: () => void }) {
  const t = useTranslations("leads.import");
  const trpc = useTRPC();
  const router = useRouter();
  const write = useWriteAccess("change");
  const hintId = useId();
  const refresh = useRefreshLeadImports();
  const [confirming, setConfirming] = useState(false);
  const decide = useMutation(trpc.leadImports.decide.mutationOptions({ onSuccess: refresh }));
  const match = useMutation(trpc.leadImports.match.mutationOptions({ onSuccess: refresh }));
  const add = useMutation(
    trpc.leadImports.add.mutationOptions({
      onSuccess: async () => {
        setConfirming(false);
        await refresh();
      },
    }),
  );
  const cancel = useMutation(
    trpc.leadImports.cancel.mutationOptions({
      onSuccess: async () => {
        toast.success(t("check.cancelled"));
        await refresh();
        router.push(routes.leadImport);
      },
    }),
  );
  const { counts } = detail;
  const fromSheet = detail.sourceSheet !== null;

  if (detail.status === "checking" || counts === null) {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <PageHeader
          title={t("check.title")}
          intro={t("check.checking", { total: formatCount(detail.progress.rowsTotal) })}
        />
        <ImportStepCaption status={detail.status} />
        <ImportProgress
          done={detail.progress.rowsDone}
          total={detail.progress.rowsTotal}
          since={null}
          label={t("check.checkingLabel")}
        />
      </div>
    );
  }

  const choices: ImportDetail["choices"] = decide.isPending
    ? { ...decide.variables, addInCrm: decide.variables.addInCrm ?? false }
    : detail.choices;
  const rows = rowsToBeAdded(counts, detail.progress.rowsToAdd, choices);
  const leads = counts.byPlan.new + counts.byPlan.returning;
  const ticked = rows - detail.progress.rowsToAdd;
  const busy = decide.isPending || match.isPending || cancel.isPending;

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader
        title={t("check.title")}
        intro={t("check.intro", { total: formatCount(detail.progress.rowsTotal) })}
      />
      <div className="flex flex-col gap-1">
        <ImportStepCaption status={detail.status} />
        {fromSheet && <p className="text-label text-muted-foreground">{t("fromSheet")}</p>}
      </div>
      {fromSheet && (
        <StageQuestion
          stage={detail.defaults.stage}
          disabled={busy}
          onChange={(stage) => {
            match.mutate({
              importId: detail.id,
              // The same columns, matched again (B13): the check runs once more with the new default.
              columns: detail.columns.map((column) => ({
                position: column.position,
                field: leadFieldOf(column.field),
              })),
              values: [],
              defaults: { stage, ownerUserId: detail.defaults.ownerUserId, budgetBasis: detail.defaults.budgetBasis },
            });
          }}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {t("check.willBeAdded")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Details
            rows={[
              {
                label: t("check.newLeads"),
                value: <span className="numbers">{formatCount(leads)}</span>,
                hint:
                  counts.returning > 0 ? t("check.returningNote", { count: formatCount(counts.returning) }) : undefined,
              },
              {
                label: t("check.repeatEnquiries"),
                value: <span className="numbers">{formatCount(counts.byPlan.enquiry)}</span>,
                hint: t("check.repeatNote"),
              },
              ...(counts.noted > 0
                ? [
                    {
                      label: t("check.noted"),
                      value: <span className="numbers">{formatCount(counts.noted)}</span>,
                      hint: t("check.notedNote"),
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>
      <CheckChoices
        counts={counts}
        choices={choices}
        fromSheet={fromSheet}
        disabled={decide.isPending || !write.allowed}
        onChoose={(next) => {
          decide.mutate({ importId: detail.id, ...next });
        }}
      />
      <RefusalAlert error={decide.error ?? match.error} />
      <NotAddedGroup importId={detail.id} notAdded={counts.notAdded} />
      <NewDestinations names={counts.newDestinations} />
      {counts.newStage >= MANY_NEW && (
        <p className="text-label text-muted-foreground">{t("check.manyNew", { count: counts.newStage })}</p>
      )}
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={rows === 0 || busy || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t("check.add", { rows })}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
        <Button variant="outline" disabled={busy} onClick={onChangeColumns}>
          {t("check.changeColumns")}
        </Button>
        <Button
          variant="link"
          className="h-auto min-h-11 px-0"
          disabled={busy || !write.allowed}
          onClick={() => {
            cancel.mutate({ importId: detail.id });
          }}
        >
          {t("check.cancelImport")}
        </Button>
        <RefusalAlert error={cancel.error} />
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("check.confirmTitle", { leads, repeats: counts.byPlan.enquiry })}
        description={`${t("check.confirmBody")}${ticked > 0 ? ` ${t("check.confirmExtra", { count: ticked })}` : ""}`}
        action={t("check.confirmAction")}
        request={add}
        onConfirm={() => {
          add.mutate({ importId: detail.id });
        }}
      />
    </div>
  );
}
