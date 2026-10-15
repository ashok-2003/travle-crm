"use client";

// One labelled input bound to a form field (DESIGN.md: a visible label above, never a placeholder alone; the error
// below with an icon, linked by aria-describedby; inputs 16px so iOS doesn't zoom).
import { CircleAlertIcon } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type InputProps = Pick<
  ComponentProps<"input">,
  "type" | "autoComplete" | "inputMode" | "autoCapitalize" | "spellCheck"
>;

export function TextField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
  ...inputProps
}: InputProps & {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
  className?: string;
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
          <Field data-invalid={fieldState.invalid} className={className}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
              id={id}
              {...inputProps}
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              aria-invalid={fieldState.invalid}
              // No attribute at all rather than an empty one, which points at nothing.
              aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
            />
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
