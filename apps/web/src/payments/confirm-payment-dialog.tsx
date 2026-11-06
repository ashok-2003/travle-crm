"use client";

// Confirming a payment: the person types what really arrived (a claim prefilled with what the customer says they paid, an
// AI booking with the advance code worked out, else empty, with the AI's note beside it) and, for a payment the AI took,
// the bank's reference. Recording it once and telling the customer is the
// api's; the toast on success says how (use-payments.ts).
import type { PaymentToCheck } from "@travel-crm/contracts/bookings";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useWriteAccess } from "@/subscription/write-access";
import { MessagePreview } from "./message-preview";
import { useConfirmPayment } from "./use-payments";

type Problem = "required" | "invalid" | "reference";

const entered = z.object({ amountPaise: z.int().min(1), reference: z.string().max(60) });

type Confirming = PaymentToCheck & { kind: "claim" | "ai_booking" };

function ConfirmForm({
  formId,
  payment,
  confirm,
  close,
}: {
  formId: string;
  payment: Confirming;
  confirm: ReturnType<typeof useConfirmPayment>;
  close: () => void;
}) {
  const t = useTranslations("payments.confirm");
  const tPayments = useTranslations("payments");
  const asked = payment.kind === "claim" ? payment.claimedPaise : payment.expectedPaise;
  const values = { amount: asked === null ? "" : rupeesFieldText(asked), reference: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, z.infer<typeof entered>, Problem>(
    values,
    (typed) =>
      checked(
        entered.safeParse({ amountPaise: paiseFromRupeesText(typed.amount) ?? -1, reference: typed.reference.trim() }),
        typed,
        ([key]) => (key === "amountPaise" ? "amount" : "reference"),
        (field) => (field === "amount" ? "invalid" : "reference"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  // The message for the amount typed, once typing pauses.
  const typed = paiseFromRupeesText(useDebouncedValue(useWatch({ control: form.control, name: "amount" })));
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        confirm.mutate({ kind: payment.kind, id: payment.id, ...input }, { onSuccess: close });
      })}
    >
      <MoneyField control={form.control} name="amount" label={t("amount")} hint={t("amountHint")} />
      {payment.aiNote !== null && (
        <p className="text-muted-foreground">{tPayments("aiNote", { note: payment.aiNote })}</p>
      )}
      {payment.kind === "ai_booking" ? (
        <TextField control={form.control} name="reference" label={t("reference")} hint={t("referenceHint")} />
      ) : (
        payment.reference !== null && (
          <p className="text-muted-foreground">{t("claimReference", { reference: payment.reference })}</p>
        )
      )}
      <MessagePreview
        input={{
          kind: payment.kind,
          id: payment.id,
          outcome: "confirm",
          ...(typed === null || typed < 1 ? {} : { amountPaise: typed }),
        }}
      />
      <FormAlert sending={confirm} problem={formProblem} />
    </form>
  );
}

export function ConfirmPaymentDialog({ payment, describedBy }: { payment: Confirming; describedBy: string }) {
  const t = useTranslations("payments.confirm");
  const access = useWriteAccess("change");
  const confirm = useConfirmPayment();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={opener}
        aria-label={t("actionOf", { name: payment.person.name })}
        aria-describedby={access.allowed ? undefined : describedBy}
        disabled={!access.allowed}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      <FormDialog
        dialog={{ open, setOpen }}
        sending={confirm}
        returnFocusTo={opener}
        title={t("title")}
        description={t("description")}
        submit={t("submit")}
        submitting={t("submitting")}
      >
        {(formId) => (
          <ConfirmForm
            formId={formId}
            payment={payment}
            confirm={confirm}
            close={() => {
              setOpen(false);
            }}
          />
        )}
      </FormDialog>
    </>
  );
}
