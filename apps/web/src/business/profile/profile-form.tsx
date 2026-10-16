"use client";

// The business profile form (spec 7.1): the business, its contact, its bank account and its invoice prefix, checked by
// the api's own schema before anything is sent. Problems show under their boxes and a refusal above the button. A newer
// profile (saved elsewhere, then refreshed) updates the boxes not being changed and keeps what is being typed. While
// the organization can't make changes (ADR 0021), the boxes are locked and the button says why.
import type { BusinessProfileDetails } from "@travel-crm/contracts/profile";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { GstStateField } from "@/components/forms/gst-state-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { useWriteAccess } from "@/subscription/write-access";
import { BankAccountNumberField } from "./bank-account-number-field";
import { ProfileTextField } from "./profile-text-field";
import { profileValuesOf, stateNameOfGstin, toProfileInput, type ProfileValues } from "./profile-values";
import { useSaveProfile } from "./use-profile";

function FormSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-section font-semibold">
          {title}
        </h2>
        {hint && <p className="text-label text-muted-foreground">{hint}</p>}
      </div>
      <FieldGroup>{children}</FieldGroup>
    </section>
  );
}

export function ProfileForm({ profile }: { profile: BusinessProfileDetails | null }) {
  const t = useTranslations("business.profile");
  const tCommon = useTranslations("common");
  const write = useWriteAccess();
  const save = useSaveProfile();
  const resolver: Resolver<ProfileValues> = (values) => {
    const result = toProfileInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<ProfileValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as keyof ProfileValues] = {
        type: "validate",
        message: t(`problems.${problem}`, { state: stateNameOfGstin(values.gstin) ?? "" }),
      };
    }
    return { values: {}, errors };
  };
  const form = useForm<ProfileValues>({
    resolver,
    values: profileValuesOf(profile),
    resetOptions: { keepDirtyValues: true },
  });
  const [changingAccount, setChangingAccount] = useState(false);
  const submit = form.handleSubmit((values) => {
    const result = toProfileInput(values);
    if (!result.ok) return;
    save.mutate(result.input, {
      // Everything as the api keeps it (GSTIN in capitals, the phone in E.164), the account number masked again.
      onSuccess: (saved) => {
        form.reset(profileValuesOf(saved), { keepDirtyValues: false });
        setChangingAccount(false);
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset disabled={!write.allowed} className="flex flex-col gap-8">
        <FormSection id="business" title={t("business")}>
          <ProfileTextField form={form} name="legalName" label={t("legalName")} hint={t("legalNameHint")} />
          <ProfileTextField form={form} name="gstin" label={t("gstin")} hint={t("gstinHint")} mono />
          <GstStateField
            control={form.control}
            name="gstStateCode"
            label={t("gstState")}
            hint={t("gstStateHint")}
            placeholder={t("chooseState")}
          />
          <ProfileTextField form={form} name="address" label={t("address")} autoComplete="street-address" multiline />
        </FormSection>
        <FormSection id="contact" title={t("contact")}>
          <ProfileTextField form={form} name="contactName" label={t("contactName")} autoComplete="name" />
          <ProfileTextField
            form={form}
            name="contactPhone"
            label={t("contactPhone")}
            prefix="+91"
            inputMode="tel"
            autoComplete="tel-national"
            mono
          />
        </FormSection>
        <FormSection id="bank" title={t("bank")} hint={t("bankHint")}>
          <ProfileTextField form={form} name="bankAccountName" label={t("bankAccountName")} />
          <BankAccountNumberField
            form={form}
            saved={profile?.bankAccountNumber ?? null}
            changing={changingAccount}
            onChangingChange={setChangingAccount}
          />
          <ProfileTextField form={form} name="bankIfsc" label={t("bankIfsc")} mono />
          <ProfileTextField form={form} name="bankName" label={t("bankName")} />
        </FormSection>
        <FormSection id="invoices" title={t("invoices")}>
          <ProfileTextField
            form={form}
            name="invoicePrefix"
            label={t("invoicePrefix")}
            hint={t("invoicePrefixHint")}
            mono
          />
        </FormSection>
      </fieldset>
      <RefusalAlert error={save.error} />
      <div className="flex flex-col items-end gap-2">
        <Button
          type="submit"
          disabled={!write.allowed || save.isPending}
          aria-describedby={write.hint ? "profile-write-hint" : undefined}
        >
          {save.isPending ? tCommon("saving") : tCommon("save")}
        </Button>
        {write.hint && <FieldDescription id="profile-write-hint">{write.hint}</FieldDescription>}
      </div>
    </form>
  );
}
