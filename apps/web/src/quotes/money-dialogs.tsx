"use client";

// The two forms of a quote's money (step 3, P0): a payment due (its label, amount and date: "Advance", ₹20,000, by 5
// Nov) and a payment received (amount, day, how it came and its reference, such as the UPI transaction id). Each is
// checked by the api's own schema before it is sent.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  addInstallmentInput,
  paymentMethods,
  recordPaymentInput,
  type AddInstallmentInput,
  type RecordPaymentInput,
} from "@travel-crm/contracts/quotes";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useMe } from "@/session/me-context";
import { useQuoteChanges } from "./use-quotes";

type Problem = "required" | "invalid";
const amountOf = (text: string) => paiseFromRupeesText(text) ?? -1;

function InstallmentForm({ formId, quoteId, onSave, sending }: FormProps<AddInstallmentInput>) {
  const t = useTranslations("quotes.money.installmentForm");
  const values = { label: "", amount: "", dueOn: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, AddInstallmentInput, Problem>(
    values,
    (typed) =>
      checked(
        addInstallmentInput.safeParse({
          quoteId,
          label: typed.label,
          amountPaise: amountOf(typed.amount),
          dueOn: typed.dueOn,
        }),
        typed,
        (path) =>
          path[0] === "label"
            ? "label"
            : path[0] === "amountPaise"
              ? "amount"
              : path[0] === "dueOn"
                ? "dueOn"
                : undefined,
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="label"
        label={t("label")}
        hint={t("labelHint")}
        disabled={sending.isPending}
      />
      <MoneyField control={form.control} name="amount" label={t("amount")} />
      <DateField control={form.control} name="dueOn" label={t("dueOn")} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

interface FormProps<Input> {
  formId: string;
  quoteId: string;
  onSave: (input: Input) => void;
  sending: { isPending: boolean; error: unknown };
}

export function AddInstallmentDialog({ quoteId }: { quoteId: string }) {
  const t = useTranslations("quotes.money");
  const dialog = useFormDialog(t("installmentAdded"));
  const { addInstallment } = useQuoteChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={addInstallment}
      trigger={{ label: t("addInstallment"), variant: "outline" }}
      title={t("installmentTitle")}
      description={t("installmentDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <InstallmentForm
          formId={formId}
          quoteId={quoteId}
          sending={addInstallment}
          onSave={(input) => {
            addInstallment.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
        />
      )}
    </FormDialog>
  );
}

function PaymentForm({
  formId,
  quoteId,
  onSave,
  sending,
  suggested,
}: FormProps<RecordPaymentInput> & { suggested: number }) {
  const t = useTranslations("quotes.money.paymentForm");
  const today = calendarDateIn(new Date(), useMe().organization.timeZone);
  // One id for this form, so a double tap or a retry after a lost answer records the payment once.
  const [requestId] = useState(() => crypto.randomUUID());
  const values = {
    amount: suggested > 0 ? rupeesFieldText(suggested) : "",
    receivedOn: today,
    method: "upi",
    reference: "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, RecordPaymentInput, Problem>(
    values,
    (typed) =>
      checked(
        recordPaymentInput.safeParse({
          quoteId,
          amountPaise: amountOf(typed.amount),
          receivedOn: typed.receivedOn,
          method: typed.method,
          reference: typed.reference,
          requestId,
        }),
        typed,
        (path) =>
          path[0] === "amountPaise"
            ? "amount"
            : path[0] === "receivedOn" || path[0] === "method" || path[0] === "reference"
              ? path[0]
              : undefined,
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <MoneyField control={form.control} name="amount" label={t("amount")} />
      <DateField control={form.control} name="receivedOn" label={t("receivedOn")} />
      <SelectField
        control={form.control}
        name="method"
        label={t("method")}
        disabled={sending.isPending}
        options={paymentMethods.map((method) => ({ value: method, label: t(`methods.${method}`) }))}
      />
      <TextField
        control={form.control}
        name="reference"
        label={t("reference")}
        hint={t("referenceHint")}
        autoComplete="off"
        disabled={sending.isPending}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function RecordPaymentDialog({ quoteId, suggested }: { quoteId: string; suggested: number }) {
  const t = useTranslations("quotes.money");
  const dialog = useFormDialog(t("paymentRecorded"));
  const { recordPayment } = useQuoteChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={recordPayment}
      trigger={{ label: t("recordPayment"), variant: "default" }}
      title={t("paymentTitle")}
      description={t("paymentDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <PaymentForm
          formId={formId}
          quoteId={quoteId}
          suggested={suggested}
          sending={recordPayment}
          onSave={(input) => {
            recordPayment.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
        />
      )}
    </FormDialog>
  );
}
