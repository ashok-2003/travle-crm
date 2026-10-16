"use client";

// Who or what to export and erase: a removed member by id, or a record of a person by its type and id. Checked by the
// api's own schema before anything is sent, each problem under its field. Erase is offered once the export shown is of
// the very subject typed: the api refuses an erasure without it.
import type { ErasureSubject } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toErasureSubject, type SubjectField, type SubjectProblem, type SubjectValues } from "./subject-values";

function SubjectInput({
  label,
  hint,
  value,
  problem,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  problem: SubjectProblem | undefined;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  return (
    <FormField label={label} hint={hint} error={problem && t(problem)}>
      {(links) => (
        <Input
          {...links}
          value={value}
          className="numbers"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </FormField>
  );
}

export function SubjectForm({
  busy,
  exported,
  onExport,
  onErase,
}: {
  busy: boolean;
  /** The subject whose export is shown, if one is. */
  exported: ErasureSubject | null;
  onExport: (subject: ErasureSubject) => void;
  onErase: (subject: ErasureSubject) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const id = useId();
  const [values, setValues] = useState<SubjectValues>({ kind: "member", memberId: "", recordType: "", recordId: "" });
  const [problems, setProblems] = useState<Partial<Record<SubjectField, SubjectProblem>>>({});
  const set = (field: SubjectField) => (value: string) => {
    setValues({ ...values, [field]: value });
  };
  /** The subject when the fields hold one, else null, with each problem shown. */
  const subject = (): ErasureSubject | null => {
    const result = toErasureSubject(values);
    setProblems(result.ok ? {} : result.problems);
    return result.ok ? result.subject : null;
  };
  const typed = toErasureSubject(values);
  const exportShown = exported !== null && typed.ok && JSON.stringify(typed.subject) === JSON.stringify(exported);
  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = subject();
        if (chosen) onExport(chosen);
      }}
    >
      <FieldSet>
        <FieldLegend variant="label">{t("kind")}</FieldLegend>
        <RadioGroup
          value={values.kind}
          onValueChange={(kind) => {
            setValues({ ...values, kind: kind === "record" ? "record" : "member" });
            setProblems({});
          }}
        >
          {(["member", "record"] as const).map((kind) => (
            <Field key={kind} orientation="horizontal" className="min-h-11">
              <RadioGroupItem id={`${id}-${kind}`} value={kind} />
              <FieldLabel htmlFor={`${id}-${kind}`} className="font-normal">
                {t(kind)}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      {values.kind === "member" ? (
        <SubjectInput
          label={t("memberId")}
          value={values.memberId}
          problem={problems.memberId}
          onChange={set("memberId")}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <SubjectInput
            label={t("recordType")}
            hint={t("recordTypeHint")}
            value={values.recordType}
            problem={problems.recordType}
            onChange={set("recordType")}
          />
          <SubjectInput
            label={t("recordId")}
            value={values.recordId}
            problem={problems.recordId}
            onChange={set("recordId")}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("exporting") : t("export")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy || !exportShown}
          aria-describedby={`${id}-erase-hint`}
          onClick={() => {
            const chosen = subject();
            if (chosen) onErase(chosen);
          }}
        >
          {t("erase")}
        </Button>
      </div>
      <p id={`${id}-erase-hint`} className="max-w-[65ch] text-caption text-muted-foreground">
        {exportShown ? t("eraseReady") : t("eraseNeedsExport")}
      </p>
    </form>
  );
}
