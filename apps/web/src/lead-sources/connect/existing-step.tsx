"use client";

// Step 3 of connecting (spec 6.5, S14): what to do with the rows already in the sheet. Only new rows from now on (the
// default), or also check the rows already there, through the lead import's preview. A sheet with no rows skips the step.
// Connect the sheet asks once, then sends the choice and the confirmation.
import { useMutation } from "@tanstack/react-query";
import { importRowLimits } from "@travel-crm/contracts/imports";
import type { ExistingRowChoice, SheetColumnsView, SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BackLink } from "@/components/text-link";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/data/trpc";
import { formatCount } from "@/lib/format";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useRefreshLeadSheets } from "../use-lead-sheets";
import { ConnectCaption } from "./connect-caption";
import { ReadingSheet } from "./reading-sheet";

export function ExistingStep({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.connect.existing");
  const tConnect = useTranslations("sheets.connect");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const write = useWriteAccess("change");
  const hintId = useId();
  const refresh = useRefreshLeadSheets();
  const sheetId = detail.id;
  const [view, setView] = useState<SheetColumnsView | null>(null);
  const [choice, setChoice] = useState<ExistingRowChoice>("only_new");
  const [confirming, setConfirming] = useState(false);

  const verify = useMutation(trpc.leadSheets.verify.mutationOptions({ onSuccess: setView }));
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    verify.mutate({ sheetId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify is a new object every render
  }, [sheetId]);

  const chooseExisting = useMutation(trpc.leadSheets.chooseExisting.mutationOptions());
  const confirm = useMutation(trpc.leadSheets.confirm.mutationOptions({ onSuccess: refresh }));
  const send = async (chosen: ExistingRowChoice) => {
    await chooseExisting.mutateAsync({ sheetId, existingRows: chosen });
    await confirm.mutateAsync({ sheetId });
  };
  const request = {
    isPending: chooseExisting.isPending || confirm.isPending,
    isError: chooseExisting.isError || confirm.isError,
    error: chooseExisting.error ?? confirm.error,
    reset: () => {
      chooseExisting.reset();
      confirm.reset();
    },
  };

  // A sheet with no rows has nothing to decide: it is connected as it is.
  useEffect(() => {
    if (view !== null && view.rowCount === 0 && !request.isPending && !request.isError) {
      void send("only_new").catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the empty sheet is known
  }, [view]);

  if (view === null) {
    if (verify.isError) {
      return (
        <ErrorState
          message={tConnect("columns.loadFailed")}
          error={verify.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            verify.mutate({ sheetId });
          }}
        />
      );
    }
    return <ReadingSheet />;
  }
  if (view.rowCount === 0) return <ReadingSheet />;

  const limit = importRowLimits.leads;
  const count = formatCount(view.rowCount);
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={tConnect("back")} />
      <PageHeader title={t("title")} intro={t("question", { count: view.rowCount })} />
      <ConnectCaption step="existing" />
      {view.rowCount > limit && (
        <p className="text-label text-muted-foreground">{t("capped", { count, limit: formatCount(limit) })}</p>
      )}
      <FieldSet>
        <FieldLegend variant="label">{t("legend")}</FieldLegend>
        <RadioGroup
          value={choice}
          onValueChange={(value) => {
            setChoice(value === "check" ? "check" : "only_new");
          }}
        >
          {(
            [
              { value: "only_new", label: t("onlyNew"), hint: t("onlyNewHint") },
              { value: "check", label: t("check", { count }), hint: t("checkHint") },
            ] as const
          ).map((option) => (
            <Field key={option.value} orientation="horizontal" className="min-h-11">
              <RadioGroupItem id={`existing-${option.value}`} value={option.value} />
              <FieldContent>
                <FieldLabel htmlFor={`existing-${option.value}`} className="font-normal">
                  {option.label}
                </FieldLabel>
                <FieldDescription>{option.hint}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      <p className="text-label text-muted-foreground">{t("note")}</p>
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={request.isPending || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t("connect")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle", { sheet: detail.sheetTitle })}
        description={t("confirmDescription")}
        action={t("confirmAction")}
        destructive={false}
        request={request}
        onConfirm={() => {
          void send(choice).then(
            () => {
              setConfirming(false);
            },
            () => undefined,
          );
        }}
      />
    </div>
  );
}
