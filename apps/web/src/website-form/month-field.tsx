"use client";

// When they would travel: the next twelve months, I'm flexible, and, when the question is optional, Not sure yet
// (the api counts Not sure yet as no answer, so a required question cannot offer it).
import type { FieldMode } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { FLEXIBLE, NOT_SURE, type FormValues } from "./form-values";

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export function MonthField({
  control,
  months,
  mode,
  disabled,
}: {
  control: Control<FormValues>;
  months: string[];
  mode: FieldMode;
  disabled: boolean;
}) {
  const t = useTranslations("websiteForm.form");
  return (
    <SelectField
      control={control}
      name="travelMonth"
      label={t("month")}
      placeholder={t("chooseMonth")}
      disabled={disabled}
      options={[
        ...months.map((month) => ({ value: month, label: monthName.format(new Date(`${month}-01T00:00:00Z`)) })),
        { value: FLEXIBLE, label: t("flexible") },
        ...(mode === "optional" ? [{ value: NOT_SURE, label: t("unsure") }] : []),
      ]}
    />
  );
}
