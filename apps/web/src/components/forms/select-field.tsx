"use client";

// One labelled select bound to a react-hook-form field, as TextField is for inputs (form-field.tsx: a visible label
// above, the hint and the error below, linked by aria-describedby; the registry Select's 44px options, whose words
// wrap rather than being cut off). The value is the chosen option's `value`, or "" while none is (the placeholder):
//
//   <SelectField control={form.control} name="planId" label={t("plan")} placeholder={t("choose")}
//     options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} onChosen={(id) => …} />
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
  disabled = false,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string | undefined;
  placeholder?: string | undefined;
  options: SelectOption[];
  /** Runs after the field takes a new value, for fields that follow it. */
  onChosen?: (value: string) => void;
  /** Radix's Select opens from its own disabled, not from a disabled fieldset around it. */
  disabled?: boolean;
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
              disabled={disabled}
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
