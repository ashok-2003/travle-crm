"use client";

// A super admin changes the policy: the trial's days, then the days past due and read-only, checked by the api's own
// schema before they are sent. The save is the dialog's and closes it once the api has saved them; a refusal shows
// above the button, which sits in the dialog's footer.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { TextField } from "@/account/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FormRefusal } from "../form-refusal";
import { policyValues, toPolicyInput, type PolicyField } from "./policy-values";
import { useSetPolicy } from "./use-policy";

const FIELDS: readonly PolicyField[] = ["trialDays", "pastDueDays", "readOnlyDays"];

function PolicyForm({
  id,
  policy,
  send,
  error,
}: {
  id: string;
  policy: SubscriptionPolicy;
  send: (input: SubscriptionPolicy) => void;
  error: unknown;
}) {
  const t = useTranslations("consolePlatform.policy");
  const { form, onSubmit, formProblem } = useCheckedForm(policyValues(policy), toPolicyInput, (problem) =>
    t(`problems.${problem}`),
  );
  return (
    <form id={id} noValidate onSubmit={onSubmit(send)} className="flex flex-col gap-6">
      <FieldGroup>
        {FIELDS.map((field) => (
          <TextField
            key={field}
            control={form.control}
            name={field}
            label={t(field)}
            inputMode="numeric"
            autoComplete="off"
            className="[&_input]:numbers"
          />
        ))}
      </FieldGroup>
      <FormRefusal problem={formProblem} error={error} />
    </form>
  );
}

export function PolicyDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: SubscriptionPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.policy");
  const tCommon = useTranslations("common");
  const formId = useId();
  const save = useSetPolicy(() => {
    onOpenChange(false);
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // A refusal from an earlier try isn't the next one's.
        if (!next) save.reset();
        onOpenChange(next);
      }}
      busy={save.isPending}
      title={t("changeTitle")}
      description={t("changeDescription")}
      footer={
        <Button type="submit" form={formId} disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {save.isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      }
    >
      {open && <PolicyForm id={formId} policy={policy} error={save.error} send={save.mutate} />}
    </ResponsiveDialog>
  );
}
