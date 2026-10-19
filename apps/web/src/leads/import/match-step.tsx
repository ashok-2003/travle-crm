"use client";

// Matching a lead file's columns (spec 3.2 step 2, B8-B13): what each column holds, the values of an Owner or Stage
// column and where each goes, what the file leaves open, and what is still needed (Name, and a phone, email or
// Instagram). The guesses are filled in, "As last time" where the agency matched the column before. Check the rows
// sends the lot and starts the check. From the preview the same screen changes the match (B13): it runs the check again.
import { useMutation } from "@tanstack/react-query";
import {
  leadStage,
  type BudgetBasis,
  type LeadImportStage,
  type MatchLeadColumnsInput,
} from "@travel-crm/contracts/crm";
import type { ImportColumn, ImportDetail, ImportField } from "@travel-crm/contracts/imports";
import { CheckIcon, CircleIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useTRPC } from "@/data/trpc";
import { ColumnMatcher } from "@/imports/column-matcher";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { ValueMatcher } from "@/imports/value-matcher";
import { formatDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useLeadOwners } from "../use-lead-owners";
import { LeadFileQuestions } from "./lead-file-questions";
import { leadFieldOf, matchableStages, useLeadFieldOptions } from "./lead-import-fields";
import { useRefreshLeadImports } from "./use-lead-import";

type ValueFieldName = "owner" | "stage";

const keyOf = (field: ValueFieldName, value: string) => `${field}\u0000${value}`;

/** Each stored value match's target, by field and value. */
function storedTargets(detail: ImportDetail): Map<string, string | null> {
  return new Map(
    detail.valueMatches.flatMap((match) =>
      match.field === "owner" || match.field === "stage"
        ? [[keyOf(match.field, match.value), match.target] as const]
        : [],
    ),
  );
}

export function MatchStep({
  detail,
  onBack,
  onChecked,
}: {
  detail: ImportDetail;
  /** Set when the screen was reached from the preview: the way back to it. */
  onBack?: () => void;
  onChecked?: () => void;
}) {
  const t = useTranslations("leads.import");
  const tStages = useTranslations("leads.stages");
  const trpc = useTRPC();
  const write = useWriteAccess("change");
  const hintId = useId();
  const { timeZone } = useMe().organization;
  const fieldOptions = useLeadFieldOptions();
  const owners = useLeadOwners();
  const refresh = useRefreshLeadImports();
  const stored = storedTargets(detail);

  const [fields, setFields] = useState<ReadonlyMap<number, ImportField | null>>(
    () => new Map(detail.columns.map((column) => [column.position, column.field])),
  );
  const [targets, setTargets] = useState<ReadonlyMap<string, string | null>>(stored);
  const [stage, setStage] = useState<LeadImportStage>(detail.defaults.stage);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(detail.defaults.ownerUserId);
  const [basis, setBasis] = useState<BudgetBasis>(detail.defaults.budgetBasis ?? "for_everyone");

  const match = useMutation(
    trpc.leadImports.match.mutationOptions({
      onSuccess: async () => {
        onChecked?.();
        await refresh();
      },
    }),
  );

  const heldBy = (field: ImportField) => [...fields].some(([, chosen]) => chosen === field);
  const hasName = heldBy("name");
  const hasContact = heldBy("phone") || heldBy("email") || heldBy("instagram");
  const asksBasis = heldBy("budget") && !heldBy("budget_basis");

  const columnsOf = (field: ValueFieldName): ImportColumn[] =>
    detail.columns.filter((column) => fields.get(column.position) === field);

  const send = () => {
    const values = [...targets].flatMap(([key, target]): MatchLeadColumnsInput["values"] => {
      if (target === stored.get(key)) return [];
      const [field, value = ""] = key.split("\u0000");
      if (field === "owner") return [{ field, value, target }];
      const stageTarget = target === null ? { success: true, data: null } : leadStage.safeParse(target);
      return field === "stage" && stageTarget.success ? [{ field, value, target: stageTarget.data }] : [];
    });
    const columns = detail.columns.map((column) => ({
      position: column.position,
      field: leadFieldOf(fields.get(column.position) ?? null),
    }));
    match.mutate({
      importId: detail.id,
      columns,
      values,
      defaults: { stage, ownerUserId, budgetBasis: asksBasis ? basis : detail.defaults.budgetBasis },
    });
  };

  const valueMatchers = (field: ValueFieldName) =>
    columnsOf(field).map((column) => {
      if (column.values === null) {
        return (
          <p key={`${field}-${String(column.position)}`} className="text-label text-muted-foreground">
            {t("match.manyValues", { column: column.header })}
          </p>
        );
      }
      const chosen = new Map(
        column.values.map(({ value }) => [value, targets.get(keyOf(field, value)) ?? null] as const),
      );
      return (
        <ValueMatcher
          key={`${field}-${String(column.position)}`}
          heading={t(field === "owner" ? "match.ownerValues" : "match.stageValues", {
            column: column.header,
            count: column.values.length,
          })}
          values={column.values}
          targets={
            field === "owner"
              ? (owners.data ?? []).map((owner) => ({ value: owner.userId, label: owner.name }))
              : matchableStages.map((option) => ({
                  value: option,
                  // A Not a lead row is never added: the list says so where it is chosen (I9).
                  label: option === "not_a_lead" ? t("match.notALeadLeftOut") : tStages(option),
                }))
          }
          chosen={chosen}
          onChoose={(value, target) => {
            setTargets(new Map(targets).set(keyOf(field, value), target));
          }}
          defaultLabel={
            field === "owner" ? t("match.ownerDefaultValue") : t("match.stageDefaultValue", { stage: tStages(stage) })
          }
          disabled={match.isPending}
        />
      );
    });

  const needs = [
    { label: t("match.needName"), met: hasName },
    { label: t("match.needContact"), met: hasContact },
  ];

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("match.title")} intro={t("match.intro", { name: detail.fileName })} />
      <div className="flex flex-col gap-1">
        <ImportStepCaption status="matching" />
        {detail.sheet !== null && (
          <p className="text-label text-muted-foreground">
            {detail.sheet.count > 1
              ? t("sheet", { name: detail.sheet.name, count: detail.sheet.count })
              : t("sheetOnly", { name: detail.sheet.name })}
          </p>
        )}
      </div>
      {detail.sameFile !== null && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            {t("match.sameFile", {
              day: formatDay(new Date(detail.sameFile.importedAt), { timeZone }),
              count: detail.sameFile.rowsAdded,
            })}
          </AlertDescription>
        </Alert>
      )}
      <ColumnMatcher
        columns={detail.columns}
        fields={fieldOptions}
        chosen={fields}
        onChoose={(position, field) => {
          setFields(new Map(fields).set(position, field));
        }}
        disabled={match.isPending}
      />
      {valueMatchers("stage")}
      {valueMatchers("owner")}
      <section className="flex flex-col gap-3" aria-labelledby="open-questions">
        <h2 id="open-questions" className="text-section font-semibold">
          {t("match.openTitle")}
        </h2>
        <LeadFileQuestions
          stage={stage}
          onStage={setStage}
          ownerUserId={ownerUserId}
          onOwner={setOwnerUserId}
          owners={owners}
          basis={basis}
          onBasis={setBasis}
          asksBasis={asksBasis}
          disabled={match.isPending}
        />
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="needs">
        <h2 id="needs" className="text-section font-semibold">
          {t("match.needs")}
        </h2>
        <ItemGroup>
          {needs.map(({ label, met }) => (
            <Item key={label} size="sm" role="listitem">
              <ItemMedia>
                {met ? (
                  <CheckIcon aria-hidden="true" className="text-status-good-ink" />
                ) : (
                  <CircleIcon aria-hidden="true" className="text-muted-foreground" />
                )}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{label}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>
      <RefusalAlert error={match.error} />
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!hasName || !hasContact || match.isPending || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={send}
        >
          {t("match.check")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
        {onBack === undefined ? (
          <Button asChild variant="outline">
            <Link href={routes.leadImport}>{t("match.chooseAnother")}</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled={match.isPending} onClick={onBack}>
            {t("match.backToCheck")}
          </Button>
        )}
      </div>
    </div>
  );
}
