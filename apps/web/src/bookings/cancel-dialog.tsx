"use client";

// Cancelling a booking (release 6, spec 2.9): the reason, then what the agency's policy works out for today: the days left, the
// step, the trip's total, what was paid, the charge (a share of the total including GST) and the refund due. The charge may be
// changed, saying why. Cancelling ends the booking's reminders and its Confirm task, and a refund due becomes a task.
import { cancelBookingInput, type CancelBookingInput, type CancelPreview } from "@travel-crm/contracts/bookings";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { Details } from "@/components/details";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { NoteField } from "@/leads/form/note-field";
import { useBookingChanges, useCancelPreview } from "./use-bookings";

type Problem = "required" | "invalid";
type Changes = ReturnType<typeof useBookingChanges>;

function CancelForm({
  formId,
  bookingId,
  preview,
  cancel,
  dialog,
}: {
  formId: string;
  bookingId: string;
  preview: CancelPreview;
  cancel: Changes["cancel"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.cancel");
  const values = { reason: "", charge: rupeesFieldText(preview.chargePaise), chargeReason: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, CancelBookingInput, Problem>(
    values,
    (typed) => {
      const charge = paiseFromRupeesText(typed.charge);
      const changed = charge !== null && charge !== preview.chargePaise;
      return checked(
        cancelBookingInput.safeParse({
          bookingId,
          reason: typed.reason,
          ...(changed ? { chargePaise: charge, chargeOverrideReason: typed.chargeReason } : {}),
        }),
        typed,
        (path) =>
          path[0] === "reason"
            ? "reason"
            : path[0] === "chargeOverrideReason"
              ? "chargeReason"
              : path[0] === "chargePaise"
                ? "charge"
                : undefined,
        () => "invalid",
        charge === null ? { charge: "invalid" } : {},
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const typedCharge = paiseFromRupeesText(useWatch({ control: form.control, name: "charge" }));
  const charge = typedCharge ?? preview.chargePaise;
  const changed = charge !== preview.chargePaise;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        cancel.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <NoteField
        control={form.control}
        name="reason"
        label={t("reason")}
        hint={t("reasonHint")}
        disabled={cancel.isPending}
      />
      <Details
        rows={[
          {
            label: t("days"),
            value:
              preview.daysBefore === null ? t("noDate") : t("daysValue", { count: Math.max(0, preview.daysBefore) }),
          },
          { label: t("step"), value: t("stepValue", { percent: preview.chargeBasisPoints / 100 }) },
          { label: t("total"), value: <span className="numbers">{rupees(preview.totalPaise)}</span> },
          { label: t("paid"), value: <span className="numbers">{rupees(preview.paidPaise)}</span> },
          {
            label: t("refund"),
            value: <span className="numbers">{rupees(Math.max(0, preview.paidPaise - charge))}</span>,
          },
        ]}
      />
      <MoneyField control={form.control} name="charge" label={t("charge")} hint={t("chargeHint")} />
      {changed && (
        <TextField control={form.control} name="chargeReason" label={t("chargeReason")} hint={t("chargeReasonHint")} />
      )}
      <FormAlert sending={cancel} problem={formProblem} />
    </form>
  );
}

function CancelBody({
  formId,
  bookingId,
  cancel,
  dialog,
}: {
  formId: string;
  bookingId: string;
  cancel: Changes["cancel"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.cancel");
  const tCommon = useTranslations("common");
  const preview = useCancelPreview(bookingId, true);
  if (preview.data === undefined) {
    return preview.isError ? (
      <ErrorState
        message={t("previewFailed")}
        error={preview.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void preview.refetch()}
      />
    ) : (
      <LoadingRows rows={4} label={t("previewLoading")} />
    );
  }
  return <CancelForm formId={formId} bookingId={bookingId} preview={preview.data} cancel={cancel} dialog={dialog} />;
}

export function CancelBookingDialog({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookings.cancel");
  const dialog = useFormDialog(t("cancelled"));
  const { cancel } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={cancel}
      trigger={{ label: t("open"), variant: "outline" }}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive
    >
      {(formId) => <CancelBody formId={formId} bookingId={bookingId} cancel={cancel} dialog={dialog} />}
    </FormDialog>
  );
}
