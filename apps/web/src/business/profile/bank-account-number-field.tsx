"use client";

// The bank account number (Ruling B): once saved it shows only as its last four digits, with Change for a new one,
// which starts empty, and while changing, Keep for the saved one. The form still holds the saved number and sends it
// back unchanged until it is changed, but the whole number is never on screen again after it is saved.
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { ProfileTextField } from "./profile-text-field";
import { maskedAccountNumber, type ProfileValues } from "./profile-values";

export function BankAccountNumberField({
  form,
  saved,
  changing,
  onChangingChange,
}: {
  form: UseFormReturn<ProfileValues>;
  /** The number the api keeps, or null before one is saved. */
  saved: string | null;
  changing: boolean;
  onChangingChange: (changing: boolean) => void;
}) {
  const t = useTranslations("business.profile");
  useEffect(() => {
    if (changing) form.setFocus("bankAccountNumber");
  }, [changing, form]);

  const box = (
    <ProfileTextField form={form} name="bankAccountNumber" label={t("bankAccountNumber")} inputMode="numeric" mono />
  );
  if (saved === null) return box;
  if (changing) {
    return (
      <div className="flex flex-col items-start gap-2">
        {box}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            form.resetField("bankAccountNumber");
            onChangingChange(false);
          }}
        >
          {t("keepAccountNumber")}
        </Button>
      </div>
    );
  }
  return (
    <FormField label={t("bankAccountNumber")} hint={t("bankAccountNumberSaved")}>
      {(links) => (
        <InputGroup>
          <InputGroupInput {...links} readOnly value={maskedAccountNumber(saved)} className="numbers" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={t("changeAccountNumber")}
              onClick={() => {
                form.setValue("bankAccountNumber", "", { shouldDirty: true });
                onChangingChange(true);
              }}
            >
              {t("change")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </FormField>
  );
}
