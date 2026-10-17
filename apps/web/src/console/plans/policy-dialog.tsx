"use client";

// A super admin changes the policy: the trial's days, then the days past due and read-only, checked by the api's own
// schema before they are sent. The save is the dialog's and closes it once the api has saved them; a refusal shows
// above the button, which sits in the dialog's footer.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { TextField } from "@/components/forms/text-field";
import { FormAlert, FormDialog } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { policyValues, toPolicyInput, type PolicyField } from "./policy-values";
import { useSetPolicy } from "./use-policy";

const FIELDS: readonly PolicyField[] = ["trialDays", "pastDueDays", "readOnlyDays"];

function PolicyForm({
  id,
  policy,
  send,
  sending,
}: {
  id: string;
  policy: SubscriptionPolicy;
  send: (input: SubscriptionPolicy) => void;
  sending: { error: unknown };
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
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function PolicyDialog({
  policy,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  policy: SubscriptionPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consolePlatform.policy");
  const tCommon = useTranslations("common");
  const save = useSetPolicy(() => {
    onOpenChange(false);
  });
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={{ open, setOpen: onOpenChange }}
      sending={save}
      title={t("changeTitle")}
      description={t("changeDescription")}
      submit={tCommon("save")}
      submitting={tCommon("saving")}
    >
      {(formId) => <PolicyForm id={formId} policy={policy} sending={save} send={save.mutate} />}
    </FormDialog>
  );
}
