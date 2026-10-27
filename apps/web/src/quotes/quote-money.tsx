"use client";

// A quote's money (step 3, P0): its total, what was paid and what is left; the payments due (each Paid once what was
// received covers it, earliest first) and the payments received, each with its receipt, and Void for one recorded by
// mistake. Recording money is for whoever may change quotes, from a session the api reads afresh.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { ReceiptIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { AddInstallmentDialog, RecordPaymentDialog } from "./money-dialogs";
import { useOpenDocument, useQuoteChanges } from "./use-quotes";

export function QuoteMoney({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.money");
  const mayEdit = useHolds("quotes:edit");
  const { removeInstallment, voidPayment } = useQuoteChanges();
  const open = useOpenDocument(quote.id);
  const [voiding, setVoiding] = useState<string | null>(null);
  const { totals } = quote;
  const nextDue = quote.installments.find((due) => !due.paid);
  const suggested = Math.min(totals.balancePaise, nextDue?.amountPaise ?? totals.balancePaise);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ["total", totals.totalPaise],
              ["paid", totals.paidPaise],
              ["balance", totals.balancePaise],
            ] as const
          ).map(([key, paise]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t(key)}</dt>
              <dd className="numbers text-section font-semibold">{rupees(paise)}</dd>
            </div>
          ))}
        </dl>
        <RefusalAlert error={removeInstallment.error ?? open.error} />

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("due")}</h3>
          {mayEdit && <AddInstallmentDialog quoteId={quote.id} />}
        </div>
        {quote.installments.length === 0 ? (
          <p className="text-muted-foreground">{t("noInstallments")}</p>
        ) : (
          <ItemGroup>
            {quote.installments.map((due) => (
              <Item key={due.id} size="sm">
                <ItemContent>
                  <ItemTitle>{due.label}</ItemTitle>
                  <ItemDescription>{t("by", { day: formatCalendarDay(due.dueOn) })}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="numbers">{rupees(due.amountPaise)}</span>
                  {due.paid ? (
                    <StatusBadge tone="good">{t("paidBadge")}</StatusBadge>
                  ) : (
                    <StatusBadge tone="attention">{t("toPay")}</StatusBadge>
                  )}
                  {mayEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeInstallment", { label: due.label })}
                      disabled={removeInstallment.isPending}
                      onClick={() => {
                        removeInstallment.mutate({ installmentId: due.id });
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

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("received")}</h3>
          {mayEdit && quote.status !== "declined" && <RecordPaymentDialog quoteId={quote.id} suggested={suggested} />}
        </div>
        {quote.payments.length === 0 ? (
          <p className="text-muted-foreground">{t("noPayments")}</p>
        ) : (
          <ItemGroup>
            {quote.payments.map((payment) => (
              <Item key={payment.id} size="sm">
                <ItemContent>
                  <ItemTitle className="numbers">{rupees(payment.amountPaise)}</ItemTitle>
                  <ItemDescription>
                    {[formatCalendarDay(payment.receivedOn), t(`methods.${payment.method}`), payment.reference]
                      .filter((part) => part !== "")
                      .join(" · ")}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
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
                  {mayEdit && (
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
      </CardContent>
    </Card>
  );
}
