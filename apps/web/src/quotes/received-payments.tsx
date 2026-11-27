"use client";

// The payments received on a quote, each with its receipt and, for one recorded by mistake, Void (until its receipt is issued).
// The quote's page and the booking's page both show this list: money is the quote's wherever it is read.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { ReceiptIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rupees } from "@/components/forms/money-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { useOpenDocument, useQuoteChanges } from "./use-quotes";

export function ReceivedPayments({
  quoteId,
  payments,
  mayRecord,
}: {
  quoteId: string;
  payments: QuoteDetail["payments"];
  /** Receipts and Void are for whoever records payments. */
  mayRecord: boolean;
}) {
  const t = useTranslations("quotes.money");
  const { voidPayment } = useQuoteChanges();
  const open = useOpenDocument(quoteId);
  const [voiding, setVoiding] = useState<string | null>(null);
  return (
    <>
      {payments.length === 0 ? (
        <p className="text-muted-foreground">{t("noPayments")}</p>
      ) : (
        <ItemGroup>
          {payments.map((payment) => (
            <Item key={payment.id} size="sm" role="listitem">
              <ItemContent>
                <ItemTitle className="numbers">{rupees(payment.amountPaise)}</ItemTitle>
                <ItemDescription>
                  {[formatCalendarDay(payment.receivedOn), t(`methods.${payment.method}`), payment.reference]
                    .filter((part) => part !== "")
                    .join(" · ")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {mayRecord && (
                  <Button
                    variant="outline"
                    disabled={open.isPending}
                    onClick={() => {
                      open.mutate({ kind: "receipt", paymentId: payment.id });
                    }}
                  >
                    <ReceiptIcon aria-hidden="true" />
                    {t("receipt")}
                  </Button>
                )}
                {mayRecord && payment.receiptDocumentId === null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("voidNamed", { amount: rupees(payment.amountPaise) })}
                    onClick={() => {
                      setVoiding(payment.id);
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <RefusalAlert error={open.error} />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(next) => {
          if (!next) setVoiding(null);
        }}
        title={t("voidTitle")}
        description={t("voidDescription")}
        action={t("void")}
        request={voidPayment}
        onConfirm={() => {
          if (voiding === null) return;
          voidPayment.mutate(
            { paymentId: voiding },
            {
              onSuccess: () => {
                setVoiding(null);
              },
            },
          );
        }}
      />
    </>
  );
}
