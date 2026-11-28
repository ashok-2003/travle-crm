"use client";

// The tax invoice of a quote: made the first time it is asked for, opened after that. For whoever records payments, on the
// quote's page and on its booking's page.
import { FileDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { useOpenDocument } from "./use-quotes";

export function InvoiceButton({ quoteId, issued }: { quoteId: string; issued: boolean }) {
  const t = useTranslations("quotes.quote");
  const open = useOpenDocument(quoteId);
  return (
    <>
      <Button
        variant="outline"
        disabled={open.isPending}
        onClick={() => {
          open.mutate({ kind: "invoice" });
        }}
      >
        <FileDownIcon aria-hidden="true" />
        {issued ? t("invoice") : t("issueInvoice")}
      </Button>
      <RefusalAlert error={open.error} />
    </>
  );
}
