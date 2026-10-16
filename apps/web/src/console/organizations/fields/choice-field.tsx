"use client";

// A choice of a few options bound to a form field: radio buttons under a legend, each labelled and optionally
// explained (DESIGN.md: 20px radios in 44px rows, labels always visible). The error is the group's, read out with it,
// and the form can focus the group to show it.
import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FieldProblem } from "@/components/form-field";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        return (
          <FieldSet data-invalid={error !== undefined}>
            <FieldLegend id={`${id}-legend`} variant="label">
              {legend}
            </FieldLegend>
            <RadioGroup
              ref={field.ref}
              aria-labelledby={`${id}-legend`}
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              name={field.name}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={field.onChange}
            >
              {options.map((option) => (
                <Field key={option.value} orientation="horizontal" className="min-h-11">
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
            {error !== undefined && <FieldProblem id={`${id}-error`}>{error}</FieldProblem>}
          </FieldSet>
        );
      }}
    />
  );
}
