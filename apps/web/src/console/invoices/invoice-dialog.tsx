"use client";

// The invoice form over the page: "New invoice" from the screen's header, or a copy of one from its actions (the new
// invoice starts from that one's kind, billed-to, lines, GST rate and notes, with today's date). A FormDialog, whose
// success closes it in the mutation's own onSuccess.
import type { BillingDetails, InvoiceDetail } from "@travel-crm/contracts/platform";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { InvoiceForm } from "./invoice-form";
import { copiedInvoiceValues, newInvoiceValues } from "./invoice-values";
import { useCreateInvoice } from "./use-invoices";

export function InvoiceDialog({
  billing,
  copyOf,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  billing: BillingDetails;
  /** The invoice to start from; none for a new one. */
  copyOf?: InvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consoleInvoices.invoiceForm");
  const create = useCreateInvoice((number) => {
    toast.success(t("made", { number }));
    onOpenChange(false);
  });
  const today = calendarDateIn(new Date(), PLATFORM_TIME_ZONE);
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={{ open, setOpen: onOpenChange }}
      sending={create}
      title={copyOf ? t("copyTitle", { number: copyOf.number }) : t("createTitle")}
      description={copyOf ? t("copyDescription") : t("createDescription")}
      submit={t("create")}
      submitting={t("creating")}
    >
      {(formId) => (
        <InvoiceForm
          id={formId}
          billing={billing}
          initial={
            copyOf
              ? copiedInvoiceValues(copyOf, today, billing.gstin !== null)
              : newInvoiceValues(today, billing.defaultTerms)
          }
          send={create.mutate}
          sending={create}
        />
      )}
    </FormDialog>
  );
}

export function NewInvoiceButton({ billing }: { billing: BillingDetails | null | undefined }) {
  const t = useTranslations("consoleInvoices.invoices");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  return (
    <>
      <Button
        ref={button}
        disabled={!billing}
        aria-describedby={billing === null ? hintId : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t("new")}
      </Button>
      {billing === null && (
        <FieldDescription id={hintId} className="sr-only">
          {t("needsBillingDetails")}
        </FieldDescription>
      )}
      {billing && <InvoiceDialog billing={billing} open={open} onOpenChange={setOpen} returnFocusTo={button} />}
    </>
  );
}
