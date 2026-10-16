"use client";

// Onboarding's first three parts: the agency's own row (name, sign-in code, time zone, contact email), its business
// profile (legal name, GST state and GSTIN, a contact, the phone after its +91) and its Owner, who is invited by email.
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { TextField } from "@/components/forms/text-field";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { GstStateField } from "@/components/forms/gst-state-field";
import { PhoneField } from "@/components/forms/phone-field";
import { TimeZoneField } from "../fields/time-zone-field";
import type { OnboardValues } from "./onboard-values";

export function AgencyFields({ control }: { control: Control<OnboardValues> }) {
  const t = useTranslations("consoleOrganizations.onboard.agency");
  return (
    <FieldSet>
      <FieldLegend className="text-section font-semibold">{t("heading")}</FieldLegend>
      <TextField control={control} name="name" label={t("name")} autoComplete="off" />
      <TextField
        control={control}
        name="code"
        label={t("code")}
        hint={t("codeHint")}
        className="[&_input]:numbers [&_input]:uppercase"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <TimeZoneField control={control} name="timeZone" label={t("timeZone")} />
      <TextField
        control={control}
        name="contactEmail"
        label={t("contactEmail")}
        hint={t("contactEmailHint")}
        type="email"
        inputMode="email"
        autoComplete="off"
      />
    </FieldSet>
  );
}

export function ProfileFields({ control }: { control: Control<OnboardValues> }) {
  const t = useTranslations("consoleOrganizations.onboard.profile");
  return (
    <FieldSet>
      <FieldLegend className="text-section font-semibold">{t("heading")}</FieldLegend>
      <TextField control={control} name="legalName" label={t("legalName")} hint={t("legalNameHint")} />
      <GstStateField
        control={control}
        name="gstStateCode"
        label={t("gstState")}
        placeholder={t("gstStatePlaceholder")}
      />
      <TextField
        control={control}
        name="gstin"
        label={t("gstin")}
        hint={t("gstinHint")}
        className="[&_input]:numbers [&_input]:uppercase"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      <TextField control={control} name="contactName" label={t("contactName")} hint={t("contactNameHint")} />
      <PhoneField control={control} name="contactPhone" label={t("contactPhone")} hint={t("contactPhoneHint")} />
    </FieldSet>
  );
}

export function OwnerFields({ control }: { control: Control<OnboardValues> }) {
  const t = useTranslations("consoleOrganizations.onboard.owner");
  return (
    <FieldSet>
      <FieldLegend className="text-section font-semibold">{t("heading")}</FieldLegend>
      <TextField control={control} name="ownerName" label={t("name")} autoComplete="off" />
      <TextField
        control={control}
        name="ownerEmail"
        label={t("email")}
        hint={t("emailHint")}
        type="email"
        inputMode="email"
        autoComplete="off"
      />
    </FieldSet>
  );
}
