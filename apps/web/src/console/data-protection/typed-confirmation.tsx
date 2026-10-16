"use client";

// The typed confirmation permanent deletion asks for (spec 5): the organization's code, exactly as shown. The api
// checks it again (CONFIRMATION_MISMATCH).
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
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
  return (
    <FormField label={t("label", { code })} hint={t("hint")}>
      {(links) => (
        <Input
          {...links}
          value={value}
          className="numbers"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </FormField>
  );
}
