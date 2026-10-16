"use client";

// One labelled select bound to a form field, as TextField is for inputs (form-field.tsx: a visible label above, the
// hint and the error below, linked by aria-describedby; 44px options). Options' words wrap rather than being cut off.
import { type ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: ReactNode;
}

export function SelectField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  options,
  onChosen,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
  placeholder?: string | undefined;
  options: SelectOption[];
  /** Runs after the field takes a new value, for fields that follow it. */
  onChosen?: (value: string) => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={hint} error={fieldState.error?.message}>
          {(links) => (
            <Select
              name={field.name}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={(value) => {
                field.onChange(value);
                onChosen?.(value);
              }}
            >
              <SelectTrigger {...links} ref={field.ref} className="h-auto w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="whitespace-normal">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
    />
  );
}
