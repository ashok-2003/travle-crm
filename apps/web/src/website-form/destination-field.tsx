"use client";

// Where the visitor would like to go: the agency's destinations and Somewhere else, which opens a text field (spec 3.5).
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { SOMEWHERE_ELSE, type FormValues } from "./form-values";

export function DestinationField({
  form,
  destinations,
  disabled,
}: {
  form: UseFormReturn<FormValues>;
  destinations: PublicForm["destinations"];
  disabled: boolean;
}) {
  const t = useTranslations("websiteForm.form");
  return (
    <>
      <SelectField
        control={form.control}
        name="destination"
        label={t("destination")}
        placeholder={t("chooseDestination")}
        disabled={disabled}
        options={[
          ...destinations.map((destination) => ({ value: destination.id, label: destination.name })),
          { value: SOMEWHERE_ELSE, label: t("somewhereElse") },
        ]}
      />
      {form.watch("destination") === SOMEWHERE_ELSE && (
        <TextField control={form.control} name="typedDestination" label={t("typedDestination")} autoComplete="off" />
      )}
    </>
  );
}
