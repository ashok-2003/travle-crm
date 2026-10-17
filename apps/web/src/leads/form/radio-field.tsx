"use client";

// A choice of a few options bound to a form field (the lead form's hotel, food and open-lead choice): the registry
// RadioGroup under a legend, each option labelled and optionally explained, 20px radios in 44px rows; side by side
// when `inline`. The error is the group's, read out with it, and the form can focus the group (its first option).
import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FieldProblem } from "@/components/form-field";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export function RadioField<Values extends FieldValues>({
  control,
  name,
  legend,
  options,
  inline = false,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  legend: string;
  options: RadioOption[];
  inline?: boolean;
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
              aria-labelledby={`${id}-legend`}
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              name={field.name}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={field.onChange}
              className={inline ? "flex flex-wrap gap-x-6 gap-y-0" : undefined}
            >
              {options.map((option, index) => (
                <Field key={option.value} orientation="horizontal" className="min-h-11 w-auto">
                  {/* The first option takes the field's ref, so the form can focus the group to show its problem. */}
                  <RadioGroupItem
                    id={`${id}-${option.value}`}
                    value={option.value}
                    {...(index === 0 && { ref: field.ref })}
                  />
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
