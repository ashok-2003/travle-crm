"use client";

// The agency's words on the form (spec 3.2, item 4): heading, introduction, thank-you, and the website and privacy
// links. The form's own labels stay ours (W3). The first three show how much of their length is used; what each says
// when left empty is its hint. The links must be https; the contract's sentence shows under a field that isn't.
import { formTextLimits } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import { Controller, type Control } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { TextField } from "@/components/forms/text-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/session/me-context";
import type { FormValues } from "./form-values";

type CountedName = "heading" | "introduction" | "thankYouMessage";

function CountedField({
  control,
  name,
  label,
  placeholder,
  max,
  multiline = false,
}: {
  control: Control<FormValues>;
  name: CountedName;
  label: string;
  /** What the form says when this is left empty. */
  placeholder?: string;
  max: number;
  multiline?: boolean;
}) {
  const t = useTranslations("websiteFormSettings.words");
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={t("count", { used: field.value.length, max })} error={fieldState.error?.message}>
          {(links) =>
            multiline ? (
              <Textarea {...links} {...field} placeholder={placeholder} />
            ) : (
              <Input {...links} {...field} placeholder={placeholder} />
            )
          }
        </FormField>
      )}
    />
  );
}

export function WordsCard({ control }: { control: Control<FormValues> }) {
  const t = useTranslations("websiteFormSettings.words");
  const { name } = useMe().organization;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CountedField
          control={control}
          name="heading"
          label={t("formHeading")}
          placeholder={t("formHeadingDefault", { name })}
          max={formTextLimits.heading}
        />
        <CountedField
          control={control}
          name="introduction"
          label={t("introduction")}
          max={formTextLimits.introduction}
          multiline
        />
        <CountedField
          control={control}
          name="thankYouMessage"
          label={t("thankYou")}
          placeholder={t("thankYouDefault", { name })}
          max={formTextLimits.thankYouMessage}
          multiline
        />
        <TextField
          control={control}
          name="websiteUrl"
          label={t("websiteUrl")}
          hint={t("websiteUrlHint")}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={control}
          name="websiteButtonText"
          label={t("websiteButtonText")}
          hint={t("websiteButtonTextHint")}
        />
        <TextField
          control={control}
          name="privacyUrl"
          label={t("privacyUrl")}
          hint={t("privacyUrlHint")}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
        />
      </CardContent>
    </Card>
  );
}
