"use client";

// A super admin changes the policy: the trial's days, then the days past due and read-only, checked by the api's own
// schema before they are sent. It closes once the api has saved them; a refusal shows above the button.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { TextField } from "@/account/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { policyValues, toPolicyInput, type PolicyField, type PolicyValues } from "./policy-values";
import { useIsSavingPolicy, useSetPolicy } from "./use-policy";

const FIELDS: readonly PolicyField[] = ["trialDays", "pastDueDays", "readOnlyDays"];

function PolicyForm({ policy, onSaved }: { policy: SubscriptionPolicy; onSaved: () => void }) {
  const t = useTranslations("consolePlatform.policy");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const save = useSetPolicy();
  const resolver: Resolver<PolicyValues> = (values) => {
    const result = toPolicyInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<PolicyValues> = {};
    for (const field of result.problems) errors[field] = { type: "validate", message: t(`problems.${field}`) };
    return { values: {}, errors };
  };
  const form = useForm<PolicyValues>({ resolver, defaultValues: policyValues(policy) });
  const submit = form.handleSubmit((values) => {
    const result = toPolicyInput(values);
    if (result.ok) save.mutate(result.input, { onSuccess: onSaved });
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
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
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(save.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={save.isPending} className="self-end">
        {save.isPending ? tCommon("saving") : tCommon("save")}
      </Button>
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
  const saving = useIsSavingPolicy();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title={t("changeTitle")}
      description={t("changeDescription")}
    >
      {open && (
        <PolicyForm
          policy={policy}
          onSaved={() => {
            onOpenChange(false);
          }}
        />
      )}
    </ResponsiveDialog>
  );
}
