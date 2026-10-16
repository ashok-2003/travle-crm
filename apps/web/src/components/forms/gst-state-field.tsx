"use client";

// A GST state chosen from the kernel's list (contracts' gstStates), bound to a react-hook-form field: a SelectField
// whose options show each state's two-digit code in mono beside its name; the value is the code ("32"), or "" while
// none is chosen (the placeholder):
//
//   <GstStateField control={form.control} name="gstStateCode" label={t("gstState")} placeholder={t("choose")} />
//
// `disabled` keeps the list shut, as a read-only organization's form needs: a disabled fieldset doesn't stop it.
import { gstStates } from "@travel-crm/contracts/kernel";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { SelectField } from "./select-field";

const options = gstStates.map((state) => ({
  value: state.code,
  label: (
    <span className="flex gap-2">
      <span className="numbers">{state.code}</span>
      <span className="script-leading">{state.name}</span>
    </span>
  ),
}));

export function GstStateField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  disabled = false,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean;
}) {
  return (
    <SelectField
      control={control}
      name={name}
      label={label}
      hint={hint}
      placeholder={placeholder}
      options={options}
      disabled={disabled}
    />
  );
}
