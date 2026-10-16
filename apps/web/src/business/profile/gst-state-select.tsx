"use client";

// The business's GST state, picked from the kernel's list of states and union territories (spec 9.6): it decides
// whether a sale carries CGST and SGST or IGST, and a GSTIN must start with its code.
import { gstStates } from "@travel-crm/contracts/kernel";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProfileValues } from "./profile-values";

const ID = "profile-gstStateCode";

export function GstStateSelect({ form, disabled }: { form: UseFormReturn<ProfileValues>; disabled: boolean }) {
  const t = useTranslations("business.profile");
  return (
    <Controller
      control={form.control}
      name="gstStateCode"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={ID}>{t("gstState")}</FieldLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger
              id={ID}
              ref={field.ref}
              className="h-11 w-full"
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.error ? `${ID}-hint ${ID}-error` : `${ID}-hint`}
            >
              <SelectValue placeholder={t("chooseState")} />
            </SelectTrigger>
            <SelectContent>
              {gstStates.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={`${ID}-hint`}>{t("gstStateHint")}</FieldDescription>
          {fieldState.error && (
            <FieldError id={`${ID}-error`} className="flex items-start gap-1.5">
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {fieldState.error.message}
            </FieldError>
          )}
        </Field>
      )}
    />
  );
}
