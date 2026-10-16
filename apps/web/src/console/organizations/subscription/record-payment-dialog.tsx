"use client";

// Recording a payment received outside the product (spec 7.4, subscriptions.recordPayment): the rupees received, the
// day they were paid (today in the organization's zone, until changed), the day they pay through, and a reference.
// From today on, it makes the organization active again (a suspension by hand stays), as the api decides.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { MoneyField } from "../fields/money-field";
import { toRecordPaymentInput, type PaymentValues } from "./change-inputs";
import { ChangeDialog, FormFooter, useAfterChange, useCheckedForm } from "./change-form";

export function RecordPaymentDialog({ organizationId, timeZone }: { organizationId: string; timeZone: string }) {
  const t = useTranslations("consoleOrganizations.subscription.recordPayment");
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")} primary>
      {(close) => <RecordPaymentForm organizationId={organizationId} timeZone={timeZone} onDone={close} />}
    </ChangeDialog>
  );
}

function RecordPaymentForm({
  organizationId,
  timeZone,
  onDone,
}: {
  organizationId: string;
  timeZone: string;
  onDone: () => void;
}) {
  const t = useTranslations("consoleOrganizations.subscription.recordPayment");
  const trpc = useConsoleTRPC();
  const afterChange = useAfterChange(organizationId);
  const record = useMutation(
    trpc.subscriptions.recordPayment.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  const check = (values: PaymentValues) => toRecordPaymentInput(organizationId, values);
  const form = useCheckedForm(
    { amount: "", paidOn: calendarDateIn(new Date(), timeZone), paidThrough: "", reference: "" },
    check,
  );
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) record.mutate(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <MoneyField control={form.control} name="amount" label={t("amount")} hint={t("amountHint")} />
        <TextField control={form.control} name="paidOn" label={t("paidOn")} type="date" />
        <TextField control={form.control} name="paidThrough" label={t("paidThrough")} type="date" />
        <TextField
          control={form.control}
          name="reference"
          label={t("reference")}
          hint={t("referenceHint")}
          autoComplete="off"
        />
      </FieldGroup>
      <FormFooter pending={record.isPending} error={record.error} label={t("submit")} pendingLabel={t("submitting")} />
    </form>
  );
}
