"use client";

// A time of day bound to a react-hook-form field: the registry Input as a time box (R46; rule 5 bans only date inputs,
// and the registry has no time picker), labelled, hinted and with its error as every field is (form-field.tsx). The
// value is the api's 24-hour "HH:MM" on the agency's clock, and "" while empty, so the form's check names a missing
// time.
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";

export function TimeField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={hint} error={fieldState.error?.message}>
          {(links) => (
            <Input
              {...links}
              {...field}
              type="time"
              step={60}
              className="numbers"
              value={typeof field.value === "string" ? field.value : ""}
            />
          )}
        </FormField>
      )}
    />
  );
}
