"use client";

// One labelled input bound to a form field (DESIGN.md: a visible label above, never a placeholder alone; inputs 16px
// so iOS doesn't zoom). Its label, hint and error are FormField's. A password gets the show/hide button.
import type { ComponentProps } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/ui/input";

type InputProps = Pick<
  ComponentProps<"input">,
  "type" | "autoComplete" | "inputMode" | "autoCapitalize" | "spellCheck" | "disabled"
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
  const FieldInput = inputProps.type === "password" ? PasswordInput : Input;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={hint} error={fieldState.error?.message} className={className}>
          {(links) => (
            <FieldInput
              {...links}
              {...inputProps}
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
            />
          )}
        </FormField>
      )}
    />
  );
}
