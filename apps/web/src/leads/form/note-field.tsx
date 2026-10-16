"use client";

// A note in a few lines (the new lead's notes, which become its first timeline note): the registry Textarea, labelled,
// hinted and with its error as every field is (form-field.tsx).
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Textarea } from "@/components/ui/textarea";

export function NoteField<Values extends FieldValues>({
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
            <Textarea {...links} {...field} rows={3} value={typeof field.value === "string" ? field.value : ""} />
          )}
        </FormField>
      )}
    />
  );
}
