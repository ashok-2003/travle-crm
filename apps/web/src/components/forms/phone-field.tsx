"use client";

// A phone number bound to a react-hook-form field (DESIGN.md: phone fields show a +91 prefix and mono digits): the
// registry InputGroup with +91 as its addon, labelled as every field is (form-field.tsx):
//
//   <PhoneField control={form.control} name="contactPhone" label={t("contactPhone")} hint={t("contactPhoneHint")} />
//
// The value is the text as typed ("98765 43210"). The contracts' phoneNumber reads it with India as the default
// country, so a number from elsewhere can still be typed with its own + code. A form editing a stored number starts
// the box at phoneAsTyped(e164).
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { formatPhoneNumber } from "@/lib/format";

/** A stored number as the box shows it: an Indian one grouped after the field's own +91, any other whole. */
export function phoneAsTyped(e164: string | null): string {
  return e164 === null ? "" : formatPhoneNumber(e164).replace(/^\+91 /, "");
}

export function PhoneField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  autoComplete = "off",
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string | undefined;
  /** "off" where someone else's number is typed (support for an agency); "tel-national" for the person's own. */
  autoComplete?: "off" | "tel-national";
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={hint} error={fieldState.error?.message}>
          {(links) => (
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText className="numbers">+91</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                {...links}
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                type="tel"
                inputMode="tel"
                autoComplete={autoComplete}
                className="numbers"
              />
            </InputGroup>
          )}
        </FormField>
      )}
    />
  );
}
