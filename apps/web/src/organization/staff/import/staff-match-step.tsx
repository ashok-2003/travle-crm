"use client";

// The staff import's second step (spec 3.2, 3.4, B43): what each column of the file holds, and the role of the people
// in it: the Role column's values matched to the agency's roles one by one, or one role for everyone when the file has
// none. A short list says what is still needed. Check the rows sends the match, and the worker checks the file.
import { useQuery } from "@tanstack/react-query";
import { staffImportField, staffImportFields } from "@travel-crm/contracts/identity";
import type { ImportField } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Details } from "@/components/details";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { ColumnMatcher } from "@/imports/column-matcher";
import { MatchSelect } from "@/imports/match-select";
import { ValueMatcher } from "@/imports/value-matcher";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { assignableRoles } from "../create-staff-form";
import { useMatchStaffColumns, type StaffImportPage } from "./use-staff-import";

export function StaffMatchStep({
  page,
  onMatched,
  onBack,
}: {
  page: StaffImportPage;
  /** The match is sent: the check is running. */
  onMatched: () => void;
  /** Back to the preview, when the columns are being changed from it. */
  onBack?: () => void;
}) {
  const t = useTranslations("staff.import.match");
  const tImports = useTranslations("imports");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const hintId = useId();
  const write = useWriteAccess("change");
  const roles = useQuery(trpc.roles.list.queryOptions());
  const match = useMatchStaffColumns(page.id);
  const [fields, setFields] = useState<ReadonlyMap<number, ImportField | null>>(
    () => new Map(page.columns.map((column) => [column.position, column.field])),
  );
  const [targets, setTargets] = useState<ReadonlyMap<string, string | null>>(
    () =>
      new Map(page.valueMatches.filter((entry) => entry.field === "role").map((entry) => [entry.value, entry.target])),
  );
  const [fileRole, setFileRole] = useState<string | null>(page.defaults.roleKey);

  const assignable = assignableRoles(roles.data ?? []);
  const has = (field: ImportField) => [...fields.values()].includes(field);
  const roleColumn = page.columns.find((column) => fields.get(column.position) === "role");
  const needs = [
    { label: t("needName"), met: has("name") },
    { label: t("needSignIn"), met: has("username") || has("email") },
    { label: t("needRole"), met: roleColumn !== undefined || fileRole !== null },
  ];
  const ready = needs.every((need) => need.met);

  const send = () => {
    match.mutate(
      {
        importId: page.id,
        columns: page.columns.map((column) => ({
          position: column.position,
          // A staff file's columns hold staff fields only; anything else is Don't import.
          field: staffImportField.safeParse(fields.get(column.position)).data ?? null,
        })),
        values: (roleColumn?.values ?? []).map(({ value }) => ({
          field: "role" as const,
          value,
          target: targets.get(value) ?? null,
        })),
        defaults: { roleKey: fileRole },
      },
      { onSuccess: onMatched },
    );
  };

  return (
    <>
      <PageHeader title={tImports("columns.title")} intro={tImports("columns.intro")} />
      <ColumnMatcher
        columns={page.columns}
        fields={staffImportFields.map((field) => ({ field, label: tImports(`fields.staff.${field}`) }))}
        chosen={fields}
        onChoose={(position, field) => {
          setFields(new Map(fields).set(position, field));
        }}
        disabled={match.isPending}
      />
      <Details
        rows={needs.map((need) => ({
          label: need.label,
          value: (
            <StatusBadge tone={need.met ? "good" : "attention"}>{need.met ? t("matched") : t("needed")}</StatusBadge>
          ),
        }))}
      />
      {roleColumn !== undefined &&
        (roleColumn.values === null ? (
          <p className="text-muted-foreground">{t("manyRoleValues", { column: roleColumn.header })}</p>
        ) : roles.data ? (
          <ValueMatcher
            heading={t("roleValues", { column: roleColumn.header })}
            values={roleColumn.values}
            targets={assignable.map((role) => ({ value: role.key, label: role.name }))}
            chosen={targets}
            onChoose={(value, target) => {
              setTargets(new Map(targets).set(value, target));
            }}
            defaultLabel={t("roleNotMatched")}
            blank={{
              label: t("roleForBlank"),
              hint: t("roleForBlankHint"),
              chosen: fileRole,
              noneLabel: t("roleNotMatched"),
              onChoose: setFileRole,
            }}
            disabled={match.isPending}
          />
        ) : (
          <LoadingRows rows={3} />
        ))}
      {roleColumn === undefined && (
        <Field>
          <FieldTitle>{t("roleForAll")}</FieldTitle>
          <MatchSelect
            label={t("roleForAll")}
            value={fileRole}
            noneLabel={t("chooseRole")}
            options={assignable.map((role) => ({ value: role.key, label: role.name }))}
            disabled={match.isPending || !roles.data}
            onChange={setFileRole}
          />
          <FieldDescription>{t("roleForAllHint")}</FieldDescription>
        </Field>
      )}
      <RefusalAlert error={match.error} />
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!ready || !write.allowed || match.isPending}
            aria-describedby={write.hint ? hintId : undefined}
            onClick={send}
          >
            {match.isPending && <Spinner />}
            {match.isPending ? t("checking") : t("check")}
          </Button>
          {onBack && (
            <Button variant="outline" disabled={match.isPending} onClick={onBack}>
              {tCommon("cancel")}
            </Button>
          )}
        </div>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
    </>
  );
}
