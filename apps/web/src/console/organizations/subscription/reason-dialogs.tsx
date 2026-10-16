"use client";

// The changes that take only a reason, kept in the organization's audit log: suspending by hand (whatever is paid; no
// payment lifts it), lifting that suspension (super admins) and cancelling (the data kept, locked), which open from
// the subscription's Change menu; and voiding a payment recorded by mistake, from its row. Suspending, cancelling
// and voiding are destructive (DESIGN.md), their trigger and last step alike; the dialog itself is the confirmation.
import type { SubscriptionDetails, SubscriptionPayment } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FormAlert, FormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { useChangeDialog } from "../change-dialog";
import { toEndAccessInput, toVoidPaymentInput, type CheckedChange, type ReasonValues } from "./change-inputs";

function ReasonForm<Input>({
  formId,
  check,
  sending,
}: {
  formId: string;
  check: (values: ReasonValues) => CheckedChange<ReasonValues, Input>;
  sending: Sending<Input>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit, formProblem } = useCheckedForm({ reason: "" }, check, (problem) => t(`problems.${problem}`));
  return (
    <form id={formId} noValidate onSubmit={onSubmit(sending.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField
          control={form.control}
          name="reason"
          label={t("reason.label")}
          hint={t("reason.hint")}
          autoComplete="off"
        />
      </FieldGroup>
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

/** Suspending, lifting a suspension or cancelling: one dialog each, the same reason form. */
export function EndAccessDialog({
  subscription,
  change,
  state,
}: {
  subscription: SubscriptionDetails;
  change: "suspend" | "liftSuspension" | "cancel";
  state: OpenState;
}) {
  const t = useTranslations(`consoleOrganizations.subscription.${change}`);
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"), state);
  const mutation = useMutation(trpc.subscriptions[change].mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={mutation}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive={change !== "liftSuspension"}
    >
      {(formId) => (
        <ReasonForm
          formId={formId}
          check={(values) => toEndAccessInput(subscription.organizationId, values)}
          sending={mutation}
        />
      )}
    </FormDialog>
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
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(organizationId, t("done"));
  const voidPayment = useMutation(trpc.subscriptions.voidPayment.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={voidPayment}
      trigger={{
        label: t("action"),
        accessibleLabel: t("actionFor", { payment: describedAs }),
        variant: "destructive",
      }}
      title={t("title", { payment: describedAs })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive
    >
      {(formId) => (
        <ReasonForm
          formId={formId}
          check={(values) => toVoidPaymentInput(organizationId, payment.id, values)}
          sending={voidPayment}
        />
      )}
    </FormDialog>
  );
}
