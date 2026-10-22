"use client";

// The offers tickbox (W25): unticked, in the agency's words or the standard ones.
import { useTranslations } from "next-intl";
import { Controller, type Control } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import type { FormValues } from "./form-values";

export function OffersField({
  control,
  wording,
  organizationName,
}: {
  control: Control<FormValues>;
  wording: string | null;
  organizationName: string;
}) {
  const t = useTranslations("websiteForm.form");
  return (
    <Controller
      control={control}
      name="offers"
      render={({ field }) => (
        <Field orientation="horizontal" className="min-h-11">
          <Checkbox
            id={field.name}
            checked={field.value}
            onCheckedChange={(ticked) => {
              field.onChange(ticked === true);
            }}
          />
          <FieldLabel htmlFor={field.name} className="font-normal">
            {wording ?? t("offers", { name: organizationName })}
          </FieldLabel>
        </Field>
      )}
    />
  );
}
