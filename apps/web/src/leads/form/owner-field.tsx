"use client";

// Who the new lead belongs to (spec 3.2, R14): the person adding it unless someone with leads:assign picks another of
// the people who can work leads (leads.owners). The screen shows it only to them; everyone else's lead is their own.
// A list that didn't load says so with Try again; the lead is the adder's meanwhile.
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { useMe } from "@/session/me-context";
import { OwnersFailed } from "../owners-failed";
import { useLeadOwners } from "../use-lead-owners";
import type { LeadFormValues } from "./lead-form-values";

export function OwnerField({ form, disabled }: { form: UseFormReturn<LeadFormValues>; disabled: boolean }) {
  const t = useTranslations("leads.form");
  const me = useMe();
  const owners = useLeadOwners();
  const workers = owners.data ?? [];
  // The default owner is the person adding the lead, named as such even before the list arrives.
  const options = workers.some((worker) => worker.userId === me.user.id)
    ? workers
    : [{ userId: me.user.id, name: me.user.name }, ...workers];
  return (
    <>
      <SelectField
        control={form.control}
        name="ownerUserId"
        label={t("owner")}
        hint={t("ownerHint")}
        disabled={disabled}
        options={options.map((worker) => ({
          value: worker.userId,
          label: worker.userId === me.user.id ? t("me", { name: worker.name }) : worker.name,
        }))}
      />
      <OwnersFailed owners={owners} />
    </>
  );
}
