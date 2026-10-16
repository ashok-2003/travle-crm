"use client";

// A due time picked on the agency's clock (R25, R46): a day (DateField) and a time (TimeField), side by side under one
// name. The two values are the api's wallClockTime: { on: dayName's "yyyy-mm-dd", at: timeName's "HH:MM" }.
import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { TimeField } from "./time-field";

export function DueField<Values extends FieldValues>({
  control,
  dayName,
  timeName,
  label,
}: {
  control: Control<Values>;
  dayName: FieldPath<Values>;
  timeName: FieldPath<Values>;
  label: string;
}) {
  const t = useTranslations("forms.due");
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <DateField control={control} name={dayName} label={t("day")} />
        <TimeField control={control} name={timeName} label={t("time")} />
      </div>
    </FieldSet>
  );
}
