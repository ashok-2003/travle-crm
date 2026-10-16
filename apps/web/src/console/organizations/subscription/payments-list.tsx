"use client";

// The payments recorded against the subscription, newest first: the rupees received (forest: money in), the day paid,
// the day they pay through, the reference, and a way to void one recorded by mistake; a voided one says so and why.
// A table from tablets up, a divided list on phones.
import type { SubscriptionPayment } from "@travel-crm/contracts/subscriptions";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWideScreen } from "@/lib/use-wide-screen";
import { formatCalendarDay } from "./calendar-day";
import { VoidPaymentDialog } from "./reason-dialogs";

export function PaymentsList({
  organizationId,
  payments,
}: {
  organizationId: string;
  payments: SubscriptionPayment[];
}) {
  const t = useTranslations("consoleOrganizations.subscription.payments");
  const wide = useWideScreen();
  const amount = (payment: SubscriptionPayment) => (
    <span className={cn("numbers", payment.voided === null ? "text-money" : "text-muted-foreground line-through")}>
      {formatRupees(money(payment.amountPaise))}
    </span>
  );
  const state = (payment: SubscriptionPayment) =>
    payment.voided === null ? (
      <VoidPaymentDialog
        organizationId={organizationId}
        payment={payment}
        describedAs={t("describedAs", {
          amount: formatRupees(money(payment.amountPaise)),
          date: formatCalendarDay(payment.paidOn),
        })}
      />
    ) : (
      <span className="flex flex-col items-end gap-1">
        <StatusBadge tone="neutral">{t("voided")}</StatusBadge>
        <span className="text-caption text-muted-foreground break-words">{payment.voided.reason}</span>
      </span>
    );

  if (payments.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
  if (!wide) {
    return (
      <ul className="divide-y rounded-lg border">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-col gap-1">
              {amount(payment)}
              <span className="text-label text-muted-foreground">
                {t("paidOnThrough", {
                  paidOn: formatCalendarDay(payment.paidOn),
                  paidThrough: formatCalendarDay(payment.paidThrough),
                })}
              </span>
              {payment.reference !== null && <span className="text-label break-words">{payment.reference}</span>}
            </span>
            {state(payment)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.paidOn")}</TableHead>
          <TableHead scope="col">{t("columns.paidThrough")}</TableHead>
          <TableHead scope="col">{t("columns.reference")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.amount")}
          </TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("columns.state")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="numbers">{formatCalendarDay(payment.paidOn)}</TableCell>
            <TableCell className="numbers">{formatCalendarDay(payment.paidThrough)}</TableCell>
            <TableCell className="whitespace-normal break-words">{payment.reference ?? ""}</TableCell>
            <TableCell className="text-right">{amount(payment)}</TableCell>
            <TableCell className="text-right">{state(payment)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
