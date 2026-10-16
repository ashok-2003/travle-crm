"use client";

// Recording a payment received outside the product (spec 7.4, subscriptions.recordPayment): the rupees received, the
// day they were paid (today in the organization's zone, until changed), the day they pay through, and a reference.
// From today on, it makes the organization active again (a suspension by hand stays), as the api decides.
import type { RecordPaymentInput } from "@travel-crm/contracts/subscriptions";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { DateField } from "@/components/date-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { ChangeDialog, FormFooter, useChangeDialog, type Sending } from "../change-dialog";
import { useCheckedForm } from "../fields/checked-form";
import { MoneyField } from "../fields/money-field";
import { toRecordPaymentInput } from "./change-inputs";

export function RecordPaymentDialog({ organizationId, timeZone }: { organizationId: string; timeZone: string }) {
  const t = useTranslations("consoleOrganizations.subscription.recordPayment");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(organizationId, t("done"));
  const record = useMutation(trpc.subscriptions.recordPayment.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <ChangeDialog
      dialog={dialog}
      sending={record}
      label={t("action")}
      title={t("title")}
      description={t("description")}
      primary
    >
      <RecordPaymentForm organizationId={organizationId} timeZone={timeZone} record={record} />
    </ChangeDialog>
  );
}

function RecordPaymentForm({
  organizationId,
  timeZone,
  record,
}: {
  organizationId: string;
  timeZone: string;
  record: Sending<RecordPaymentInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const { form, onSubmit } = useCheckedForm(
    { amount: "", paidOn: calendarDateIn(new Date(), timeZone), paidThrough: "", reference: "" },
    (values) => toRecordPaymentInput(organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form noValidate onSubmit={onSubmit(record.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <MoneyField
          control={form.control}
          name="amount"
          label={t("recordPayment.amount")}
          hint={t("recordPayment.amountHint")}
        />
        <DateField control={form.control} name="paidOn" label={t("recordPayment.paidOn")} />
        <DateField control={form.control} name="paidThrough" label={t("recordPayment.paidThrough")} />
        <TextField
          control={form.control}
          name="reference"
          label={t("recordPayment.reference")}
          hint={t("recordPayment.referenceHint")}
          autoComplete="off"
        />
      </FieldGroup>
      <FormFooter sending={record} label={t("recordPayment.submit")} pendingLabel={t("recordPayment.submitting")} />
    </form>
  );
}
