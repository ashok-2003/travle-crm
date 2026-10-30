"use client";

// Marking a refund paid (release 6): the refund is paid outside the product, so this notes the day, how and the reference.
// For whoever records payments; it closes the "Refund" task.
import { markRefundedInput, type MarkRefundedInput } from "@travel-crm/contracts/bookings";
import { paymentMethods } from "@travel-crm/contracts/quotes";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useMe } from "@/session/me-context";
import { useBookingChanges } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;

function RefundForm({
  formId,
  bookingId,
  markRefunded,
  dialog,
}: {
  formId: string;
  bookingId: string;
  markRefunded: Changes["markRefunded"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.refund.form");
  const today = calendarDateIn(new Date(), useMe().organization.timeZone);
  const values = { refundedOn: today as string, method: "bank", reference: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, MarkRefundedInput, "required" | "invalid">(
    values,
    (typed) =>
      checked(
        markRefundedInput.safeParse({ bookingId, ...typed }),
        typed,
        (path) => (path[0] === "refundedOn" || path[0] === "method" || path[0] === "reference" ? path[0] : undefined),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        markRefunded.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <DateField control={form.control} name="refundedOn" label={t("refundedOn")} />
      <SelectField
        control={form.control}
        name="method"
        label={t("method")}
        disabled={markRefunded.isPending}
        options={paymentMethods.map((method) => ({ value: method, label: t(`methods.${method}`) }))}
      />
      <TextField
        control={form.control}
        name="reference"
        label={t("reference")}
        hint={t("referenceHint")}
        autoComplete="off"
        disabled={markRefunded.isPending}
      />
      <FormAlert sending={markRefunded} problem={formProblem} />
    </form>
  );
}

export function MarkRefundedDialog({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookings.refund");
  const dialog = useFormDialog(t("marked"));
  const { markRefunded } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={markRefunded}
      trigger={{ label: t("mark"), variant: "default" }}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <RefundForm formId={formId} bookingId={bookingId} markRefunded={markRefunded} dialog={dialog} />}
    </FormDialog>
  );
}
