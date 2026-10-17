"use client";

// Where a lead came from (spec 3.2): the form's seven sources, with an optional line of detail (who referred them,
// which post).
import { handLeadSources } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import type { LeadFormValues } from "./lead-form-values";

export function SourceFields({ form, disabled }: { form: UseFormReturn<LeadFormValues>; disabled: boolean }) {
  const t = useTranslations("leads");
  const { control } = form;
  return (
    <>
      <SelectField
        control={control}
        name="source"
        label={t("form.source.source")}
        disabled={disabled}
        options={handLeadSources.map((source) => ({ value: source, label: t(`sources.${source}`) }))}
      />
      <TextField
        control={control}
        name="sourceDetail"
        label={t("form.source.detail")}
        hint={t("form.source.detailHint")}
        autoComplete="off"
      />
    </>
  );
}
