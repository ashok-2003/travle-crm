"use client";

// The person a lead is about (spec 3.2): their name, and how to reach them, of which one is enough: a phone (+91 by
// default, another country with its own + code), an email or an Instagram handle. The new-lead form and the person
// editor share these fields.
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { AiMark } from "@/ai/fill/ai-mark";
import { PhoneField } from "@/components/forms/phone-field";
import { TextField } from "@/components/forms/text-field";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import type { LeadFormValues } from "./lead-form-values";

export function PersonFields({ form }: { form: UseFormReturn<LeadFormValues> }) {
  const t = useTranslations("leads.form.person");
  const { control } = form;
  return (
    <>
      <AiMark paths={["person.name"]}>
        <TextField control={control} name="name" label={t("name")} autoComplete="off" />
      </AiMark>
      <FieldSet>
        <FieldLegend variant="label">{t("contacts")}</FieldLegend>
        <FieldDescription>{t("contactsHint")}</FieldDescription>
        <AiMark paths={["person.phone"]}>
          <PhoneField control={control} name="phone" label={t("phone")} />
        </AiMark>
        <AiMark paths={["person.email"]}>
          <TextField
            control={control}
            name="email"
            label={t("email")}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
          />
        </AiMark>
        <AiMark paths={["person.instagramHandle"]}>
          <TextField
            control={control}
            name="instagramHandle"
            label={t("instagramHandle")}
            hint={t("instagramHint")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </AiMark>
      </FieldSet>
    </>
  );
}
