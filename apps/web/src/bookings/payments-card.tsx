"use client";

// A booking's money, all of it (bookings revamp): the trip's total, what was paid (a bar) and what is left; the payments the
// traveller says they made, waiting to be checked; each payment due with its state (Paid, Due 25 Nov, Overdue) and Change
// payments due; Record payment, the payments received with their receipts and Void, the tax invoice; and, after a
// cancellation, the refund. The money is the quote's: these call the quote's own procedures with the booking's quote, and
// the permissions and audits are the quote's.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDay } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { InvoiceButton } from "@/quotes/invoice-button";
import { ReceivedPayments } from "@/quotes/received-payments";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { ClaimsSection } from "./claims-section";
import { RefundSection } from "./refund-section";
import { SectionCard } from "./section-card";
import { ChangeScheduleDialog } from "./schedule-dialogs";

type Due = BookingDetail["installments"][number];

function DuePill({ due }: { due: Due }) {
  const t = useTranslations("bookings.payments");
  const state = mayBeMissing(due.state) ?? (due.paid ? "paid" : "due");
  if (state === "paid") return <StatusBadge tone="good">{t("paidBadge")}</StatusBadge>;
  if (state === "overdue") return <StatusBadge tone="bad">{t("overdue")}</StatusBadge>;
  return <StatusBadge tone="attention">{t("dueOn", { day: formatCalendarDay(due.dueOn) })}</StatusBadge>;
}

export function PaymentsCard({
  booking,
  onRecordPayment,
}: {
  booking: BookingDetail;
  /** Opens Record payment, for a payment due or, with none named, for what is owed next. */
  onRecordPayment: (installmentId?: string) => void;
}) {
  const t = useTranslations("bookings.payments");
  const mayEdit = useHolds("bookings:edit");
  const mayRecord = useHolds("quotes:record_payments");
  const access = useWriteAccess("change");
  const cancelled = booking.status === "cancelled";
  const percent =
    booking.totalPaise === 0 ? 0 : Math.min(100, Math.round((booking.paidPaise / booking.totalPaise) * 100));
  return (
    <SectionCard title={t("title")} anchor="money">
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            [cancelled ? "charge" : "total", booking.totalPaise],
            ["paid", booking.paidPaise],
            ["balance", booking.balancePaise],
          ] as const
        ).map(([key, paise]) => (
          <div key={key} className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t(key)}</dt>
            <dd className="numbers text-section font-semibold">{rupees(paise)}</dd>
          </div>
        ))}
      </dl>
      {booking.totalPaise > 0 && (
        <Progress
          value={percent}
          aria-label={t("paidBar", { paid: rupees(booking.paidPaise), total: rupees(booking.totalPaise) })}
        />
      )}

      <ClaimsSection booking={booking} />

      {!cancelled && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t("due")}</h3>
            {mayEdit && booking.installments.length > 0 && <ChangeScheduleDialog booking={booking} />}
          </div>
          {booking.installments.length === 0 ? (
            <p className="text-muted-foreground">{t("noInstallments")}</p>
          ) : (
            <ItemGroup>
              {booking.installments.map((due) => (
                <Item key={due.id} size="sm" role="listitem">
                  <ItemContent>
                    <ItemTitle>{due.label}</ItemTitle>
                    {/* A due that is still ahead says its day in its pill. */}
                    {(mayBeMissing(due.state) ?? (due.paid ? "paid" : "due")) !== "due" && (
                      <ItemDescription>{t("by", { day: formatCalendarDay(due.dueOn) })}</ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions>
                    <span className="numbers">{rupees(due.amountPaise)}</span>
                    <DuePill due={due} />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </>
      )}

      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("received")}</h3>
        {mayRecord && !cancelled && booking.balancePaise > 0 && (
          <Button
            variant="outline"
            disabled={!access.allowed}
            onClick={() => {
              onRecordPayment();
            }}
          >
            {t("recordPayment")}
          </Button>
        )}
      </div>
      <ReceivedPayments quoteId={booking.quoteId} payments={booking.payments} mayRecord={mayRecord} />
      {mayRecord && !cancelled && (
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceButton quoteId={booking.quoteId} issued={mayBeMissing(booking.invoiceDocumentId) != null} />
        </div>
      )}
      <RefundSection booking={booking} />
    </SectionCard>
  );
}
