"use client";

// Checking a traveller's "I've paid" (release 6): Confirm records the payment on the quote, once, for the amount that really
// arrived (the claimed one unless changed), and Reject says why it couldn't be matched. Both are for whoever records payments.
import { rejectReason, rejectReasons, type Claim, type RejectReason } from "@travel-crm/contracts/bookings";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useBookingChanges } from "./use-bookings";

type Problem = "required" | "invalid";
const amountSchema = z.int().min(1);

type Changes = ReturnType<typeof useBookingChanges>;

function ConfirmForm({
  formId,
  claim,
  confirmClaim,
  dialog,
}: {
  formId: string;
  claim: Claim;
  confirmClaim: Changes["confirmClaim"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.claims.confirmForm");
  const values = { amount: rupeesFieldText(claim.amountPaise) };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, number, Problem>(
    values,
    (typed) =>
      checked(
        amountSchema.safeParse(paiseFromRupeesText(typed.amount) ?? -1),
        typed,
        () => "amount",
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((paise) => {
        confirmClaim.mutate(
          { claimId: claim.id, ...(paise === claim.amountPaise ? {} : { amountPaise: paise }) },
          { onSuccess: () => void dialog.onSuccess() },
        );
      })}
    >
      <p className="text-muted-foreground">
        {claim.reference === "" ? t("noReference") : t("reference", { reference: claim.reference })}
      </p>
      <MoneyField control={form.control} name="amount" label={t("amount")} hint={t("amountHint")} />
      <FormAlert sending={confirmClaim} problem={formProblem} />
    </form>
  );
}

export function ConfirmClaimDialog({ claim }: { claim: Claim }) {
  const t = useTranslations("bookings.claims");
  const dialog = useFormDialog(t("confirmed"));
  const { confirmClaim } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={confirmClaim}
      trigger={{ label: t("confirm"), variant: "default" }}
      title={t("confirmTitle")}
      description={t("confirmDescription")}
      submit={t("confirmSubmit")}
      submitting={t("confirming")}
    >
      {(formId) => <ConfirmForm formId={formId} claim={claim} confirmClaim={confirmClaim} dialog={dialog} />}
    </FormDialog>
  );
}

function RejectForm({
  formId,
  claim,
  rejectClaim,
  dialog,
}: {
  formId: string;
  claim: Claim;
  rejectClaim: Changes["rejectClaim"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.claims.rejectForm");
  const values = { reason: "not_found" as string };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, RejectReason, Problem>(
    values,
    (typed) =>
      checked(
        rejectReason.safeParse(typed.reason),
        typed,
        () => "reason",
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((reason) => {
        rejectClaim.mutate({ claimId: claim.id, reason }, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <ChoiceField
        control={form.control}
        name="reason"
        legend={t("reason")}
        options={rejectReasons.map((one) => ({ value: one, label: t(`reasons.${one}`) }))}
      />
      <FormAlert sending={rejectClaim} problem={formProblem} />
    </form>
  );
}

export function RejectClaimDialog({ claim }: { claim: Claim }) {
  const t = useTranslations("bookings.claims");
  const dialog = useFormDialog(t("rejected"));
  const { rejectClaim } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={rejectClaim}
      trigger={{ label: t("reject"), variant: "outline" }}
      title={t("rejectTitle")}
      description={t("rejectDescription")}
      submit={t("rejectSubmit")}
      submitting={t("rejecting")}
    >
      {(formId) => <RejectForm formId={formId} claim={claim} rejectClaim={rejectClaim} dialog={dialog} />}
    </FormDialog>
  );
}
