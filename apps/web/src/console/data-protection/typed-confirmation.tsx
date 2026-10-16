"use client";

// The typed confirmation permanent deletion asks for (spec 5): the organization's code, exactly as shown. The api
// checks it again (CONFIRMATION_MISMATCH).
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function TypedConfirmation({
  code,
  value,
  onChange,
}: {
  code: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.confirmation");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("label", { code })}</FieldLabel>
      <Input
        id={id}
        value={value}
        className="numbers"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <FieldDescription id={`${id}-hint`}>{t("hint")}</FieldDescription>
    </Field>
  );
}
