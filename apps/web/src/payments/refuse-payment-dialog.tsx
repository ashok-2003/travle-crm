"use client";

// Saying a payment was not received, with whether the customer hears it (on by default), and dismissing a screenshot that
// is no payment to match. Neither records money; the toast on success says how the customer was told (use-payments.ts).
import { rejectReasons, type PaymentToCheck, type RejectReason } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useWriteAccess } from "@/subscription/write-access";
import { MessagePreview } from "./message-preview";
import { useDismissProof, useRefusePayment } from "./use-payments";

type Refusing = PaymentToCheck & { kind: "claim" | "ai_booking" };

export function RefusePaymentDialog({ payment, describedBy }: { payment: Refusing; describedBy: string }) {
  const t = useTranslations("payments.refuse");
  const access = useWriteAccess("change");
  const refuse = useRefusePayment();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RejectReason>("not_found");
  const [tell, setTell] = useState(true);
  const opener = useRef<HTMLButtonElement>(null);
  const tellId = useId();
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        aria-label={t("actionOf", { name: payment.person.name })}
        aria-describedby={access.allowed ? undefined : describedBy}
        disabled={!access.allowed}
        onClick={() => {
          setReason("not_found");
          setTell(true);
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        action={t("submit")}
        destructive={false}
        request={refuse}
        returnFocusTo={opener}
        onConfirm={() => {
          refuse.mutate(
            { kind: payment.kind, id: payment.id, reason, tell },
            {
              onSuccess: () => {
                setOpen(false);
              },
            },
          );
        }}
      >
        <ChoiceGroup
          legend={t("reason")}
          value={reason}
          onChange={(value) => {
            setReason(value as RejectReason);
          }}
          options={rejectReasons.map((one) => ({ value: one, label: t(`reasons.${one}`) }))}
        />
        <Field orientation="horizontal">
          <Checkbox
            id={tellId}
            checked={tell}
            onCheckedChange={(next) => {
              setTell(next === true);
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={tellId}>{t("tell")}</FieldLabel>
            <FieldDescription>{t("tellHint")}</FieldDescription>
          </FieldContent>
        </Field>
        {tell && open && <MessagePreview input={{ kind: payment.kind, id: payment.id, outcome: "not_found" }} />}
      </ConfirmDialog>
    </>
  );
}

export function DismissProofDialog({ payment, describedBy }: { payment: PaymentToCheck; describedBy: string }) {
  const t = useTranslations("payments.dismiss");
  const access = useWriteAccess("change");
  const dismiss = useDismissProof();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        aria-label={t("actionOf", { name: payment.person.name })}
        aria-describedby={access.allowed ? undefined : describedBy}
        disabled={!access.allowed}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        action={t("submit")}
        destructive={false}
        request={dismiss}
        returnFocusTo={opener}
        onConfirm={() => {
          dismiss.mutate(
            { proofId: payment.id },
            {
              onSuccess: () => {
                setOpen(false);
              },
            },
          );
        }}
      />
    </>
  );
}
