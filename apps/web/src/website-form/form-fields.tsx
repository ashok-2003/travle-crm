"use client";

// The questions the agency turned on, in the order of spec 3.5 (email, destination, when, travellers, budget, message).
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { PhoneField } from "@/components/forms/phone-field";
import { TextField } from "@/components/forms/text-field";
import { NoteField } from "@/leads/form/note-field";
import { BudgetField } from "./budget-field";
import { DestinationField } from "./destination-field";
import { MAX_MESSAGE, type FormValues } from "./form-values";
import { MonthField } from "./month-field";
import { OffersField } from "./offers-field";
import { TravellersField } from "./travellers-field";

export function FormFields({
  form: shown,
  values,
  disabled,
}: {
  form: PublicForm;
  values: UseFormReturn<FormValues>;
  disabled: boolean;
}) {
  const t = useTranslations("websiteForm.form");
  const { fields } = shown;
  const { control } = values;
  return (
    <>
      <TextField control={control} name="name" label={t("name")} autoComplete="name" />
      <PhoneField control={control} name="phone" label={t("phone")} autoComplete="tel-national" />
      {fields.email !== "off" && (
        <TextField control={control} name="email" label={t("email")} type="email" autoComplete="email" />
      )}
      {fields.destination !== "off" && (
        <DestinationField form={values} destinations={shown.destinations} disabled={disabled} />
      )}
      {fields.travelMonth !== "off" && (
        <MonthField control={control} months={shown.months} mode={fields.travelMonth} disabled={disabled} />
      )}
      {fields.travellers !== "off" && <TravellersField form={values} disabled={disabled} />}
      {fields.budget !== "off" && <BudgetField control={control} disabled={disabled} />}
      {fields.message !== "off" && (
        <NoteField
          control={control}
          name="message"
          label={t("message")}
          hint={t("messageCount", { count: values.watch("message").length, max: MAX_MESSAGE })}
          disabled={disabled}
        />
      )}
      {shown.offersTickbox && (
        <OffersField control={control} wording={shown.offersWording} organizationName={shown.organizationName} />
      )}
    </>
  );
}
