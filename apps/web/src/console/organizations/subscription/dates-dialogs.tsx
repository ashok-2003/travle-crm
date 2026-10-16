"use client";

// The subscription's two days a person sets: a trial's last day (subscriptions.setTrialEnd, while the trial lasts),
// and the day it is paid through without a payment, time given or a correction, with the reason kept in the
// organization's audit log (subscriptions.setPaidThrough).
import type { SetPaidThroughInput, SetTrialEndInput, SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { DateField } from "@/components/date-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { FormDialog, FormFooter, type Sending } from "@/components/forms/form-dialog";
import { useChangeDialog } from "../change-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { toPaidThroughInput, toTrialEndInput } from "./change-inputs";

export function TrialEndDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.trialEnd");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"));
  const save = useMutation(trpc.subscriptions.setTrialEnd.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog dialog={dialog} sending={save} label={t("action")} title={t("title")} description={t("description")}>
      <TrialEndForm subscription={subscription} save={save} />
    </FormDialog>
  );
}

function TrialEndForm({ subscription, save }: { subscription: SubscriptionDetails; save: Sending<SetTrialEndInput> }) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit, formProblem } = useCheckedForm(
    { trialEndsOn: subscription.trialEndsOn ?? "" },
    (values) => toTrialEndInput(subscription.organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form noValidate onSubmit={onSubmit(save.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <DateField control={form.control} name="trialEndsOn" label={t("trialEnd.trialEndsOn")} />
      </FieldGroup>
      <FormFooter
        sending={save}
        problem={formProblem}
        label={t("trialEnd.submit")}
        pendingLabel={t("trialEnd.submitting")}
      />
    </form>
  );
}

export function PaidThroughDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.paidThrough");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"));
  const save = useMutation(trpc.subscriptions.setPaidThrough.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog dialog={dialog} sending={save} label={t("action")} title={t("title")} description={t("description")}>
      <PaidThroughForm subscription={subscription} save={save} />
    </FormDialog>
  );
}

function PaidThroughForm({
  subscription,
  save,
}: {
  subscription: SubscriptionDetails;
  save: Sending<SetPaidThroughInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit, formProblem } = useCheckedForm(
    { paidThrough: subscription.paidThrough ?? "", reason: "" },
    (values) => toPaidThroughInput(subscription.organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form noValidate onSubmit={onSubmit(save.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <DateField control={form.control} name="paidThrough" label={t("paidThrough.paidThrough")} />
        <TextField control={form.control} name="reason" label={t("reason.label")} hint={t("reason.hint")} />
      </FieldGroup>
      <FormFooter
        sending={save}
        problem={formProblem}
        label={t("paidThrough.submit")}
        pendingLabel={t("paidThrough.submitting")}
      />
    </form>
  );
}
