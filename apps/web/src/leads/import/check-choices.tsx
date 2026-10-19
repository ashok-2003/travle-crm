"use client";

// The check's "Your choice" group (spec 3.2 step 3, B16, B33): blocked contacts' rows and rows already imported, each
// left out unless its Checkbox is ticked, and, for an import that reads a Google Sheet, the rows for people who already
// have a lead with you (the Sheets sync). Ticking sends decide at once: the check isn't run again (B13).
import type { ImportCounts, ImportDetail } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { formatCount } from "@/lib/format";

type Choices = ImportDetail["choices"];

function Choice({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" className="min-h-11">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(next) => {
          onChange(next === true);
        }}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

export function CheckChoices({
  counts,
  choices,
  fromSheet,
  disabled,
  onChoose,
}: {
  counts: ImportCounts;
  choices: Choices;
  fromSheet: boolean;
  disabled: boolean;
  onChoose: (choices: Choices) => void;
}) {
  const t = useTranslations("leads.import.check");
  const blocked = counts.byPlan.blocked;
  const imported = counts.byPlan.already_imported;
  const inCrm = counts.byPlan.in_crm;
  const hint = t("leftOutUnlessTicked");
  return (
    <>
      {(blocked > 0 || imported > 0) && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {t("yourChoice")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {blocked > 0 && (
              <Choice
                label={t("addBlocked", { count: blocked })}
                hint={hint}
                checked={choices.addBlocked}
                disabled={disabled}
                onChange={(addBlocked) => {
                  onChoose({ ...choices, addBlocked });
                }}
              />
            )}
            {imported > 0 && (
              <Choice
                label={t("addAlreadyImported", { count: imported })}
                hint={hint}
                checked={choices.addAlreadyImported}
                disabled={disabled}
                onChange={(addAlreadyImported) => {
                  onChoose({ ...choices, addAlreadyImported });
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
      {fromSheet && inCrm > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {t("alreadyInCrm")}
            </CardTitle>
            <CardDescription>
              {t("alreadyInCrmBody", {
                count: formatCount(inCrm),
                open: formatCount(counts.inCrm.open),
                closed: formatCount(counts.inCrm.closed),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Choice
              label={t("addInCrm", { count: inCrm })}
              hint={hint}
              checked={choices.addInCrm}
              disabled={disabled}
              onChange={(addInCrm) => {
                onChoose({ ...choices, addInCrm });
              }}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
