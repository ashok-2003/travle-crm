"use client";

// What a super admin does with one invoice: download its PDF (a cancelled invoice too), copy it as the start of a new
// one, or cancel it with a reason.
import type { BillingDetails, InvoiceDetail, InvoiceSummary } from "@travel-crm/contracts/platform";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceDialog } from "./invoice-dialog";
import { useCancelInvoice, useDownloadInvoice, useReadInvoice } from "./use-invoices";

function CancelInvoiceDialog({
  invoice,
  onOpenChange,
  returnFocusTo,
}: {
  invoice: InvoiceSummary;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("consoleInvoices.cancelInvoice");
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const cancel = useCancelInvoice((number) => {
    toast.success(t("cancelled", { number }));
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={t("title", { number: invoice.number })}
      description={t("description")}
      action={t("action")}
      request={cancel}
      confirmDisabled={reason.trim() === ""}
      onConfirm={() => {
        cancel.mutate({ invoiceId: invoice.id, reason });
      }}
    >
      <Field>
        <FieldLabel htmlFor={reasonId}>{t("reason")}</FieldLabel>
        <Textarea
          id={reasonId}
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
    </ConfirmDialog>
  );
}

type OpenDialog = "copy" | "cancel" | null;

export function InvoiceActions({ invoice, billing }: { invoice: InvoiceSummary; billing: BillingDetails | null }) {
  const t = useTranslations("consoleInvoices.invoices");
  const [open, setOpen] = useState<OpenDialog>(null);
  const [copyOf, setCopyOf] = useState<InvoiceDetail | null>(null);
  // The dialogs aren't the menu's: closed, they give the focus back to its button.
  const menu = useRef<HTMLButtonElement>(null);
  const download = useDownloadInvoice();
  const read = useReadInvoice();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menu} variant="ghost" size="icon" aria-label={t("actionsFor", { number: invoice.number })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              download.mutate(invoice.id);
            }}
          >
            {t("download")}
          </DropdownMenuItem>
          {billing && (
            <DropdownMenuItem
              onSelect={() => {
                read.mutate(invoice.id, {
                  onSuccess: (detail) => {
                    setCopyOf(detail);
                    setOpen("copy");
                  },
                });
              }}
            >
              {t("copy")}
            </DropdownMenuItem>
          )}
          {invoice.status === "issued" && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setOpen("cancel");
              }}
            >
              {t("cancel")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(download.isError || read.isError) && <RefusalAlert error={download.error ?? read.error} />}
      {open === "copy" && copyOf && billing && (
        <InvoiceDialog
          billing={billing}
          copyOf={copyOf}
          open
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          returnFocusTo={menu}
        />
      )}
      {open === "cancel" && (
        <CancelInvoiceDialog
          invoice={invoice}
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          returnFocusTo={menu}
        />
      )}
    </>
  );
}
