"use client";

// Step 2 of connecting (spec 6.5, S10-S13): the sheet's tab (a Select when there are several) and what each column
// holds, with Google Forms' own headers guessed and "As last time" for a column the agency matched before. The same
// ColumnMatcher and ValueMatcher the lead import uses, without Stage (a new row is always New), and Next sends the match.
// Opened again from the sheet's page it saves a new match (S15).
import { useMutation } from "@tanstack/react-query";
import type { ImportColumn, ImportField } from "@travel-crm/contracts/imports";
import { type SheetColumnsView, type SheetDetail, type SheetField, sheetField } from "@travel-crm/contracts/sheets";
import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTRPC } from "@/data/trpc";
import { ColumnMatcher } from "@/imports/column-matcher";
import { ValueMatcher } from "@/imports/value-matcher";
import { useLeadFieldOptions } from "@/leads/import/lead-import-fields";
import { useLeadOwners } from "@/leads/use-lead-owners";
import { routes, sheetRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useRefreshLeadSheets } from "../use-lead-sheets";
import { ConnectCaption } from "./connect-caption";
import { FieldChecklist } from "./field-checklist";

const sheetFieldOf = (field: ImportField | null): SheetField | null => {
  const parsed = sheetField.safeParse(field);
  return parsed.success ? parsed.data : null;
};

/** A sheet's column as the shared matcher shows it: its place is its position, and Google Forms' guesses are common names. */
function asImportColumn(column: SheetColumnsView["columns"][number], position: number): ImportColumn {
  return {
    position,
    header: column.header,
    samples: column.samples,
    values: null,
    field: column.field,
    guessedBy: column.guessedBy === null ? null : column.guessedBy === "last-time" ? "last-time" : "common-name",
  };
}

export function ColumnsStep({ detail, matchingAgain = false }: { detail: SheetDetail; matchingAgain?: boolean }) {
  const t = useTranslations("sheets.connect");
  const tSheet = useTranslations("sheets.sheet");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const write = useWriteAccess("change");
  const hintId = useId();
  const owners = useLeadOwners();
  const refresh = useRefreshLeadSheets();
  const fieldOptions = useLeadFieldOptions().filter(({ field }) => field !== "stage");
  const sheetId = detail.id;

  const [view, setView] = useState<SheetColumnsView | null>(null);
  const [fields, setFields] = useState<ReadonlyMap<string, SheetField | null> | null>(null);
  const [targets, setTargets] = useState<ReadonlyMap<string, string | null>>(new Map());
  /** The Owner values' automatic matches, which only a different choice is sent over. */
  const [stored, setStored] = useState<ReadonlyMap<string, string | null>>(new Map());

  const verify = useMutation(
    trpc.leadSheets.verify.mutationOptions({
      onSuccess: (read) => {
        setView(read);
        setFields((current) => current ?? new Map(read.columns.map((column) => [column.headerKey, column.field])));
        const automatic = new Map((read.ownerValues ?? []).map(({ value, target }) => [value, target] as const));
        setStored(automatic);
        setTargets((chosen) => new Map([...automatic].map(([value, target]) => [value, chosen.get(value) ?? target])));
      },
    }),
  );
  const chooseTab = useMutation(
    trpc.leadSheets.chooseTab.mutationOptions({
      onSuccess: async () => {
        setFields(null);
        setView(null);
        await refresh();
      },
    }),
  );
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const match = useMutation(
    trpc.leadSheets.match.mutationOptions({
      onSuccess: async () => {
        await refresh();
        // Matched again from the sheet's page: back to it. A draft moves on by its stored step.
        if (matchingAgain) router.push(sheetRoute(sheetId));
      },
    }),
  );

  const ownerKey = fields === null ? undefined : [...fields].find(([, field]) => field === "owner")?.[0];
  const asked = useRef<string | null>(null);
  useEffect(() => {
    // Google is read when the tab or the Owner column changes, not for every Select the person touches.
    const key = `${detail.tabGid}|${ownerKey ?? ""}`;
    if (asked.current === key) return;
    asked.current = key;
    verify.mutate(ownerKey === undefined ? { sheetId } : { sheetId, valuesOf: ownerKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify is a new object every render
  }, [sheetId, detail.tabGid, ownerKey]);

  if (view === null || fields === null) {
    if (verify.isError) {
      return (
        <ErrorState
          message={t("columns.loadFailed")}
          error={verify.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            asked.current = null;
            verify.mutate({ sheetId });
          }}
        />
      );
    }
    return (
      <div role="status" className="flex items-center gap-3">
        <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
        <p>{t("columns.reading")}</p>
      </div>
    );
  }

  const columns = view.columns.map(asImportColumn);
  const held = (field: SheetField) => [...fields.values()].includes(field);
  const hasName = held("name");
  const hasContact = held("phone") || held("email") || held("instagram");
  const busy = match.isPending || chooseTab.isPending;

  const send = () => {
    const values = [...targets].flatMap(([value, target]) => (target === stored.get(value) ? [] : [{ value, target }]));
    match.mutate({
      sheetId,
      columns: view.columns.map(({ headerKey }) => ({ headerKey, field: fields.get(headerKey) ?? null })),
      values,
    });
  };

  const ownerColumn = view.columns.find((column) => column.headerKey === ownerKey);
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink
        href={matchingAgain ? sheetRoute(sheetId) : routes.leadSources}
        label={matchingAgain ? detail.sheetTitle : t("back")}
      />
      <PageHeader
        title={t("columns.title")}
        intro={t("columns.intro", { sheet: view.sheetTitle, tab: detail.tabTitle })}
      />
      {!matchingAgain && <ConnectCaption step="columns" />}
      {view.tabs.length > 1 && !matchingAgain && (
        <FormField label={t("columns.tab")} hint={t("columns.tabHint")}>
          {(links) => (
            <Select
              value={view.tabGid}
              disabled={busy}
              onValueChange={(tabGid) => {
                chooseTab.mutate({ sheetId, tabGid });
              }}
            >
              <SelectTrigger {...links} className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {view.tabs.map((tab) => (
                  <SelectItem key={tab.gid} value={tab.gid}>
                    {tab.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      <ColumnMatcher
        columns={columns}
        fields={fieldOptions}
        chosen={new Map(view.columns.map((column, position) => [position, fields.get(column.headerKey) ?? null]))}
        onChoose={(position, field) => {
          const column = view.columns[position];
          if (column !== undefined) setFields(new Map(fields).set(column.headerKey, sheetFieldOf(field)));
        }}
        disabled={busy}
      />
      {ownerColumn !== undefined &&
        (view.ownerValues === null ? (
          <p className="text-label text-muted-foreground">{t("columns.manyValues", { column: ownerColumn.header })}</p>
        ) : (
          <ValueMatcher
            heading={t("columns.ownerValues", { column: ownerColumn.header, count: view.ownerValues.length })}
            values={view.ownerValues}
            targets={(owners.data ?? []).map((owner) => ({ value: owner.userId, label: owner.name }))}
            chosen={targets}
            onChoose={(value, target) => {
              setTargets(new Map(targets).set(value, target));
            }}
            defaultLabel={t("columns.ownerDefault")}
            disabled={busy}
          />
        ))}
      <FieldChecklist hasName={hasName} hasContact={hasContact} />
      <RefusalAlert error={match.error ?? chooseTab.error} />
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!hasName || !hasContact || busy || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={
            matchingAgain
              ? () => {
                  setConfirming(true);
                }
              : send
          }
        >
          {matchingAgain ? tSheet("matchAgainDialog.action") : t("columns.next")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
      {matchingAgain && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={tSheet("matchAgainDialog.title")}
          description={tSheet("matchAgainDialog.description")}
          action={tSheet("matchAgainDialog.action")}
          destructive={false}
          request={match}
          onConfirm={send}
        />
      )}
    </div>
  );
}
