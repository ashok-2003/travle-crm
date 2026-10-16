"use client";

// The changes that take only a reason, kept in the organization's audit log: suspending by hand (whatever is paid; no
// payment lifts it), lifting that suspension (super admins), cancelling (the data kept, locked), and voiding a
// payment recorded by mistake. Suspending, cancelling and voiding are the destructive button, the dialog itself the
// confirmation.
import type { SubscriptionDetails, SubscriptionPayment } from "@travel-crm/contracts/subscriptions";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { ChangeDialog, FormFooter, useChangeDialog, type Sending } from "../change-dialog";
import { useCheckedForm } from "../fields/checked-form";
import { toEndAccessInput, toVoidPaymentInput, type CheckedChange, type ReasonValues } from "./change-inputs";

function ReasonForm<Input>({
  check,
  sending,
  submit,
  submitting,
  destructive = false,
}: {
  check: (values: ReasonValues) => CheckedChange<ReasonValues, Input>;
  sending: Sending<Input>;
  submit: string;
  submitting: string;
  destructive?: boolean;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit } = useCheckedForm({ reason: "" }, check, (problem) => t(`problems.${problem}`));
  return (
    <form noValidate onSubmit={onSubmit(sending.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField
          control={form.control}
          name="reason"
          label={t("reason.label")}
          hint={t("reason.hint")}
          autoComplete="off"
        />
      </FieldGroup>
      <FormFooter sending={sending} label={submit} pendingLabel={submitting} destructive={destructive} />
    </form>
  );
}

/** Suspending, lifting a suspension or cancelling: one dialog each, the same reason form. */
export function EndAccessDialog({
  subscription,
  change,
}: {
  subscription: SubscriptionDetails;
  change: "suspend" | "liftSuspension" | "cancel";
}) {
  const t = useTranslations(`consoleOrganizations.subscription.${change}`);
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"));
  const mutation = useMutation(trpc.subscriptions[change].mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <ChangeDialog
      dialog={dialog}
      sending={mutation}
      label={t("action")}
      title={t("title")}
      description={t("description")}
    >
      <ReasonForm
        check={(values) => toEndAccessInput(subscription.organizationId, values)}
        sending={mutation}
        submit={t("submit")}
        submitting={t("submitting")}
        destructive={change !== "liftSuspension"}
      />
    </ChangeDialog>
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
    <ChangeDialog
      dialog={dialog}
      sending={voidPayment}
      label={t("action")}
      accessibleLabel={t("actionFor", { payment: describedAs })}
      title={t("title", { payment: describedAs })}
      description={t("description")}
    >
      <ReasonForm
        check={(values) => toVoidPaymentInput(organizationId, payment.id, values)}
        sending={voidPayment}
        submit={t("submit")}
        submitting={t("submitting")}
        destructive
      />
    </ChangeDialog>
  );
}
