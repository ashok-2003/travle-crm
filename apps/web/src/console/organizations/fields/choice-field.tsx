"use client";

// A choice of a few options bound to a form field: radio buttons under a legend, each labelled and optionally
// explained (DESIGN.md: 20px radios with a 44px hit area, labels always visible).
import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string | undefined;
}

export function ChoiceField<Values extends FieldValues>({
  control,
  name,
  legend,
  options,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  legend: string;
  options: ChoiceOption[];
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid}>
          <FieldLegend id={`${id}-legend`} variant="label">
            {legend}
          </FieldLegend>
          <RadioGroup
            aria-labelledby={`${id}-legend`}
            name={field.name}
            value={typeof field.value === "string" ? field.value : ""}
            onValueChange={field.onChange}
          >
            {options.map((option) => (
              <Field key={option.value} orientation="horizontal">
                <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
                    {option.label}
                  </FieldLabel>
                  {option.description && <FieldDescription>{option.description}</FieldDescription>}
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
        </FieldSet>
      )}
    />
  );
}
