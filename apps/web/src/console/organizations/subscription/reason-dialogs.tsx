"use client";

// The changes that take only a reason, kept in the organization's audit log: suspending by hand (whatever is paid; no
// payment lifts it), lifting that suspension (super admins), cancelling (the data kept, locked), and voiding a
// payment recorded by mistake. Suspending and cancelling end the agency's access: their button is red, the dialog
// itself the confirmation.
import type { SubscriptionDetails, SubscriptionPayment } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { toEndAccessInput, toVoidPaymentInput, type Checked, type ReasonValues } from "./change-inputs";
import { ChangeDialog, FormFooter, useAfterChange, useCheckedForm } from "./change-form";

function ReasonForm<Input>({
  check,
  send,
  pending,
  error,
  submit: submitLabel,
  submitting,
  destructive = false,
}: {
  check: (values: ReasonValues) => Checked<ReasonValues, Input>;
  send: (input: Input) => void;
  pending: boolean;
  error: unknown;
  submit: string;
  submitting: string;
  destructive?: boolean;
}) {
  const t = useTranslations("consoleOrganizations.subscription.reason");
  const form = useCheckedForm({ reason: "" }, check);
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) send(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField control={form.control} name="reason" label={t("label")} hint={t("hint")} autoComplete="off" />
      </FieldGroup>
      <FormFooter
        pending={pending}
        error={error}
        label={submitLabel}
        pendingLabel={submitting}
        destructive={destructive}
      />
    </form>
  );
}

type EndAccess = "suspend" | "liftSuspension" | "cancel";

/** Suspending, lifting a suspension or cancelling: one dialog each, the same reason form. */
export function EndAccessDialog({ subscription, change }: { subscription: SubscriptionDetails; change: EndAccess }) {
  const t = useTranslations(`consoleOrganizations.subscription.${change}`);
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")}>
      {(close) => <EndAccessForm organizationId={subscription.organizationId} change={change} onDone={close} />}
    </ChangeDialog>
  );
}

function EndAccessForm({
  organizationId,
  change,
  onDone,
}: {
  organizationId: string;
  change: EndAccess;
  onDone: () => void;
}) {
  const t = useTranslations(`consoleOrganizations.subscription.${change}`);
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(organizationId);
  const options = {
    onSuccess: async () => {
      await afterChange(t("done"));
      onDone();
    },
  };
  const procedures = {
    suspend: trpc.subscriptions.suspend.mutationOptions(options),
    liftSuspension: trpc.subscriptions.liftSuspension.mutationOptions(options),
    cancel: trpc.subscriptions.cancel.mutationOptions(options),
  };
  const mutation = useMutation(procedures[change]);
  return (
    <ReasonForm
      check={(values) => toEndAccessInput(organizationId, values)}
      send={(input) => {
        mutation.mutate(input);
      }}
      pending={mutation.isPending}
      error={mutation.error}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive={change !== "liftSuspension"}
    />
  );
}

export function VoidPaymentDialog({
  organizationId,
  payment,
  describedAs,
}: {
  organizationId: string;
  payment: SubscriptionPayment;
  /** The payment in words, e.g. "₹2,950 paid on 16 Oct", which names its button and dialog. */
  describedAs: string;
}) {
  const t = useTranslations("consoleOrganizations.subscription.voidPayment");
  return (
    <ChangeDialog
      label={t("action")}
      accessibleLabel={t("actionFor", { payment: describedAs })}
      title={t("title", { payment: describedAs })}
      description={t("description")}
    >
      {(close) => <VoidPaymentForm organizationId={organizationId} payment={payment} onDone={close} />}
    </ChangeDialog>
  );
}

function VoidPaymentForm({
  organizationId,
  payment,
  onDone,
}: {
  organizationId: string;
  payment: SubscriptionPayment;
  onDone: () => void;
}) {
  const t = useTranslations("consoleOrganizations.subscription.voidPayment");
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(organizationId);
  const voidPayment = useMutation(
    trpc.subscriptions.voidPayment.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  return (
    <ReasonForm
      check={(values) => toVoidPaymentInput(organizationId, payment.id, values)}
      send={(input) => {
        voidPayment.mutate(input);
      }}
      pending={voidPayment.isPending}
      error={voidPayment.error}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive
    />
  );
}
