"use client";

// A rupee amount bound to a react-hook-form field (DESIGN.md: a ₹ prefix, mono, right-aligned, Indian grouping once
// the person moves on), labelled as every field is (form-field.tsx), the ₹ the registry input group's addon:
//
//   <MoneyField control={form.control} name="amount" label={t("amount")} hint={t("amountHint")} />
//
// The field's value is the text as typed ("2,950.50"); read it into paise with the contracts' paiseFromRupeesText
// when the form is checked. Start it from paise with rupeesFieldText ("2,950", the symbol and ".00" left out).
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { formatMoney, money } from "@travel-crm/domain/kernel";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";

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
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const text = typeof field.value === "string" ? field.value : "";
        return (
          <FormField label={label} hint={hint} error={fieldState.error?.message}>
            {(links) => (
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText aria-hidden="true">₹</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  {...links}
                  name={field.name}
                  ref={field.ref}
                  value={text}
                  inputMode="decimal"
                  autoComplete="off"
                  className="numbers text-right"
                  onChange={field.onChange}
                  onBlur={() => {
                    field.onChange(groupedRupees(text));
                    field.onBlur();
                  }}
                />
              </InputGroup>
            )}
          </FormField>
        );
      }}
    />
  );
}
