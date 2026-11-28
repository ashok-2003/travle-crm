"use client";

// A quote's money (step 3, P0): its total, what was paid and what is left; the payments due (each Paid once what was
// received covers it, earliest first) and the payments received, each with its receipt, and Void for one recorded by
// mistake. Recording money is for whoever may change quotes, from a session the api reads afresh.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { mayBeMissing } from "@/lib/older-api";
import { cn } from "@/lib/utils";
import { useAgencyToday } from "@/packages/use-agency-today";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { AddInstallmentDialog, RecordPaymentDialog } from "./money-dialogs";
import { ReceivedPayments } from "./received-payments";
import { useQuoteChanges } from "./use-quotes";

type Due = QuoteDetail["installments"][number];

/** The api's state for a payment due; an older api sends none, and then the day is compared with the agency's today. */
export function dueState(due: Due, today: string): "paid" | "due" | "overdue" {
  const sent = mayBeMissing(due.state);
  if (sent !== undefined) return sent;
  return due.paid ? "paid" : due.dueOn < today ? "overdue" : "due";
}

export function QuoteMoney({
  quote,
  reading,
}: {
  quote: QuoteDetail;
  /** The quote is read, not written (sent, accepted, or an AI booking's draft until Edit): money in its colours. */
  reading: boolean;
}) {
  const t = useTranslations("quotes.money");
  const mayEdit = useHolds("quotes:edit") && quote.status === "draft" && !reading;
  const mayRecord = useHolds("quotes:record_payments");
  const { removeInstallment } = useQuoteChanges();
  const { totals } = quote;
  const today = useAgencyToday();
  // Money is read in the colours people know once the quote is out: nothing received red, part paid amber, all paid green.
  const coloured = reading && quote.status !== "declined" && quote.status !== "replaced";
  const paidState =
    !coloured || totals.totalPaise === 0
      ? null
      : totals.paidPaise === 0
        ? "none"
        : totals.balancePaise > 0
          ? "part"
          : "full";
  const nextDue = quote.installments.find((due) => !due.paid);
  const suggested = Math.min(totals.balancePaise, nextDue?.amountPaise ?? totals.balancePaise);

  return (
    <Card className={reading ? "max-xl:-order-1" : undefined}>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ["total", totals.totalPaise, undefined],
              [
                "paid",
                totals.paidPaise,
                paidState === "none"
                  ? "text-status-bad-ink"
                  : paidState === "full"
                    ? "text-status-good-ink"
                    : undefined,
              ],
              [
                "balance",
                totals.balancePaise,
                paidState === "part"
                  ? "text-status-attention-ink"
                  : paidState === "full"
                    ? "text-status-good-ink"
                    : undefined,
              ],
            ] as const
          ).map(([key, paise, ink]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t(key)}</dt>
              <dd className={cn("numbers text-section font-semibold", ink)}>{rupees(paise)}</dd>
            </div>
          ))}
        </dl>
        {paidState !== null && (
          <div>
            <StatusBadge tone={paidState === "none" ? "bad" : paidState === "part" ? "attention" : "good"}>
              {t(paidState === "none" ? "nothingReceived" : paidState === "part" ? "partPaid" : "paidInFull")}
            </StatusBadge>
          </div>
        )}
        <RefusalAlert error={removeInstallment.error} />

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
              <Item key={due.id} size="sm" role="listitem">
                <ItemContent>
                  <ItemTitle>{due.label}</ItemTitle>
                  <ItemDescription>{t("by", { day: formatCalendarDay(due.dueOn) })}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="numbers">{rupees(due.amountPaise)}</span>
                  {dueState(due, today) === "paid" ? (
                    <StatusBadge tone="good">{t("paidBadge")}</StatusBadge>
                  ) : dueState(due, today) === "overdue" ? (
                    <StatusBadge tone="bad">{t("overdue")}</StatusBadge>
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
          {mayRecord && (quote.status === "sent" || quote.status === "accepted") && totals.balancePaise > 0 && (
            <RecordPaymentDialog quoteId={quote.id} suggested={suggested} />
          )}
        </div>
        <ReceivedPayments quoteId={quote.id} payments={quote.payments} mayRecord={mayRecord} />
      </CardContent>
    </Card>
  );
}
