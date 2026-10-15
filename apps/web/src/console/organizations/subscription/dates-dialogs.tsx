"use client";

// The subscription's two days a person sets: a trial's last day (subscriptions.setTrialEnd, while the trial lasts),
// and the day it is paid through without a payment, time given or a correction, with the reason kept in the
// organization's audit log (subscriptions.setPaidThrough).
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { toPaidThroughInput, toTrialEndInput, type PaidThroughValues, type TrialEndValues } from "./change-inputs";
import { ChangeDialog, FormFooter, useAfterChange, useCheckedForm } from "./change-form";

export function TrialEndDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.trialEnd");
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")}>
      {(close) => <TrialEndForm subscription={subscription} onDone={close} />}
    </ChangeDialog>
  );
}

function TrialEndForm({ subscription, onDone }: { subscription: SubscriptionDetails; onDone: () => void }) {
  const t = useTranslations("consoleOrganizations.subscription.trialEnd");
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(subscription.organizationId);
  const save = useMutation(
    trpc.subscriptions.setTrialEnd.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  const check = (values: TrialEndValues) => toTrialEndInput(subscription.organizationId, values);
  const form = useCheckedForm({ trialEndsOn: subscription.trialEndsOn ?? "" }, check);
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) save.mutate(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField control={form.control} name="trialEndsOn" label={t("trialEndsOn")} type="date" />
      </FieldGroup>
      <FormFooter pending={save.isPending} error={save.error} label={t("submit")} pendingLabel={t("submitting")} />
    </form>
  );
}

export function PaidThroughDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.paidThrough");
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")}>
      {(close) => <PaidThroughForm subscription={subscription} onDone={close} />}
    </ChangeDialog>
  );
}

function PaidThroughForm({ subscription, onDone }: { subscription: SubscriptionDetails; onDone: () => void }) {
  const t = useTranslations("consoleOrganizations.subscription.paidThrough");
  const tReason = useTranslations("consoleOrganizations.subscription.reason");
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(subscription.organizationId);
  const save = useMutation(
    trpc.subscriptions.setPaidThrough.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  const check = (values: PaidThroughValues) => toPaidThroughInput(subscription.organizationId, values);
  const form = useCheckedForm({ paidThrough: subscription.paidThrough ?? "", reason: "" }, check);
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) save.mutate(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField control={form.control} name="paidThrough" label={t("paidThrough")} type="date" />
        <TextField control={form.control} name="reason" label={tReason("label")} hint={tReason("hint")} />
      </FieldGroup>
      <FormFooter pending={save.isPending} error={save.error} label={t("submit")} pendingLabel={t("submitting")} />
    </form>
  );
}
