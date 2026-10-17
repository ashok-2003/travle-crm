"use client";

// A choice of a few options bound to a form field (a lead's hotel, food and open-lead choice; a plan's billing and how a
// subscription starts): the registry RadioGroup under a legend, each option labelled and optionally explained
// (DESIGN.md: 20px radios in 44px rows, labels always visible); side by side when `inline`. The error is the group's,
// read out with it, and the form can focus the group, which passes the focus to its chosen radio, or the first.
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
  inline = false,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  legend: string;
  options: ChoiceOption[];
  /** The options side by side, wrapping, rather than one under another. */
  inline?: boolean;
}) {
  const id = useId();
  const label = (option: ChoiceOption) => (
    <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
      {option.label}
    </FieldLabel>
  );
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
              className={inline ? "flex flex-wrap gap-x-6 gap-y-0" : undefined}
            >
              {options.map((option) => (
                <Field key={option.value} orientation="horizontal" className={inline ? "min-h-11 w-auto" : "min-h-11"}>
                  <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
                  {/* A label alone sits in the row's middle; one with words under it, at its top. */}
                  {option.description ? (
                    <FieldContent>
                      {label(option)}
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                  ) : (
                    label(option)
                  )}
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
