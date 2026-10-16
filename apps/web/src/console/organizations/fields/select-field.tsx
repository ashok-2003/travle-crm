"use client";

// One labelled select bound to a form field, as TextField is for inputs (DESIGN.md: a visible label above, the error
// below with an icon, linked by aria-describedby; 44px options). Options' words wrap rather than being cut off.
import { CircleAlertIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [hint ? `${id}-hint` : null, fieldState.error ? `${id}-error` : null].filter(
          (part) => part !== null,
        );
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select
              name={field.name}
              value={typeof field.value === "string" ? field.value : ""}
              onValueChange={(value) => {
                field.onChange(value);
                onChosen?.(value);
              }}
            >
              <SelectTrigger
                id={id}
                ref={field.ref}
                className="h-auto w-full"
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
                onBlur={field.onBlur}
              >
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
            {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
            {fieldState.error && (
              <FieldError id={`${id}-error`} className="flex items-start gap-1.5">
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {fieldState.error.message}
              </FieldError>
            )}
          </Field>
        );
      }}
    />
  );
}
