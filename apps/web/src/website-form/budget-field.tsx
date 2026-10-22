"use client";

// The budget: an amount in whole rupees and whether it is for everyone or per person.
import { formBudgetBases } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import type { FormValues } from "./form-values";

export function BudgetField({ control, disabled }: { control: Control<FormValues>; disabled: boolean }) {
  const t = useTranslations("websiteForm.form");
  const basisWords = { everyone: t("forEveryone"), per_person: t("perPerson") };
  return (
    <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
      <MoneyField control={control} name="budget" label={t("budget")} />
      <SelectField
        control={control}
        name="budgetBasis"
        label={t("budgetBasis")}
        disabled={disabled}
        options={formBudgetBases.map((basis) => ({ value: basis, label: basisWords[basis] }))}
      />
    </div>
  );
}
