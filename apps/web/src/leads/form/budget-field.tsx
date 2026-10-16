"use client";

// The budget (spec 3.2): an amount in rupees (MoneyField: ₹, mono, Indian grouping once typed) and whether it is per
// person or for everyone travelling.
import { budgetBases } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import type { LeadFormValues } from "./lead-form-values";

export function BudgetField({ form, disabled }: { form: UseFormReturn<LeadFormValues>; disabled: boolean }) {
  const t = useTranslations("leads");
  const { control } = form;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MoneyField control={control} name="budget" label={t("form.trip.budget")} />
      <SelectField
        control={control}
        name="budgetBasis"
        label={t("form.trip.budgetBasis")}
        disabled={disabled}
        options={budgetBases.map((basis) => ({ value: basis, label: t(`budgetBasis.${basis}`) }))}
      />
    </div>
  );
}
