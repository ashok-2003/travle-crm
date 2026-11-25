"use client";

// A switch with its label beside it, for a form that keeps the choice in its values.
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function SwitchField<Values extends FieldValues>({
  control,
  name,
  label,
  id,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  id: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className="min-h-11">
          <Switch id={id} checked={field.value === true} onCheckedChange={field.onChange} />
          <FieldLabel htmlFor={id} className="font-normal">
            {label}
          </FieldLabel>
        </Field>
      )}
    />
  );
}
