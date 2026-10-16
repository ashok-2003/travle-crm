"use client";

// A rupee amount bound to a form field (DESIGN.md: a ₹ prefix, mono, right-aligned, Indian grouping once the person
// moves on): the text as typed, read into paise by the contracts' own parser when the form is checked.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { formatMoney, money } from "@travel-crm/domain/kernel";
import { CircleAlertIcon } from "lucide-react";
import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** An amount as the field shows it: "2,950", "1,250.50", without the symbol the field puts beside it. */
export function rupeesFieldText(paise: number): string {
  return formatMoney(money(paise), { symbol: false }).replace(/\.00$/, "");
}

/** "2950" becomes "2,950", "1250.5" becomes "1,250.50"; text that isn't an amount is left for the check to name. */
export function groupedRupees(text: string): string {
  const paise = paiseFromRupeesText(text);
  return paise === null ? text : rupeesFieldText(paise);
}

export function MoneyField<Values extends FieldValues>({
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
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const text = typeof field.value === "string" ? field.value : "";
        const describedBy = [hint ? `${id}-hint` : null, fieldState.error ? `${id}-error` : null].filter(
          (part) => part !== null,
        );
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                ₹
              </span>
              <Input
                id={id}
                name={field.name}
                ref={field.ref}
                value={text}
                inputMode="decimal"
                autoComplete="off"
                className="numbers pl-7 text-right"
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
                onChange={field.onChange}
                onBlur={() => {
                  field.onChange(groupedRupees(text));
                  field.onBlur();
                }}
              />
            </div>
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
