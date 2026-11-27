"use client";

// What a booking waits on, one tap from its action (bookings revamp): confirming it, a payment overdue, payments or proofs to
// check, travellers' details missing, the travel date missing. In amber, and nothing at all when nothing waits. A cancelled
// or completed booking waits on nothing.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { rupees } from "@/components/forms/money-field";
import { cardTints } from "@/components/card-tints";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { SectionCard } from "./section-card";
import { ConfirmBookingDialog } from "./schedule-dialogs";
import { TravelDateDialog } from "./travel-date-dialog";

function Row({ title, detail, action }: { title: string; detail?: string; action: ReactNode }) {
  return (
    <Item size="sm" role="listitem">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {detail !== undefined && <ItemDescription>{detail}</ItemDescription>}
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </Item>
  );
}

/** A link to a part of this page, drawn as a button. */
function Jump({ to, label }: { to: string; label: string }) {
  return (
    <Button variant="outline" asChild>
      <a href={`#${to}`}>{label}</a>
    </Button>
  );
}

export function NeedsYou({
  booking,
  onRecordPayment,
}: {
  booking: BookingDetail;
  /** Opens Record payment for a payment due. */
  onRecordPayment: (installmentId: string) => void;
}) {
  const t = useTranslations("bookings.needsYou");
  const mayEdit = useHolds("bookings:edit");
  const mayRecord = useHolds("quotes:record_payments");
  const access = useWriteAccess("change");
  const live = booking.status === "requested" || booking.status === "confirmed";
  if (!live) return null;
  const rows: ReactNode[] = [];
  if (booking.status === "requested" && mayEdit) {
    rows.push(
      <Row
        key="confirm"
        title={t("confirmTitle")}
        detail={t("confirmBody", { name: booking.customerName })}
        action={<ConfirmBookingDialog booking={booking} />}
      />,
    );
  }
  for (const due of booking.installments.filter((one) => mayBeMissing(one.state) === "overdue")) {
    rows.push(
      <Row
        key={`overdue-${due.id}`}
        title={t("overdue", { label: due.label, amount: rupees(due.amountPaise) })}
        detail={t("overdueSince", { day: formatCalendarDay(due.dueOn) })}
        action={
          mayRecord && (
            <Button
              variant="outline"
              disabled={!access.allowed}
              onClick={() => {
                onRecordPayment(due.id);
              }}
            >
              {t("recordPayment")}
            </Button>
          )
        }
      />,
    );
  }
  if (booking.pendingClaims > 0) {
    rows.push(
      <Row
        key="claims"
        title={t("claims", { count: booking.pendingClaims })}
        action={<Jump to="money" label={t("check")} />}
      />,
    );
  }
  if (booking.proofMessageIds.length > 0 && booking.payments.length === 0) {
    rows.push(<Row key="proof" title={t("proof")} action={<Jump to="proof" label={t("check")} />} />);
  }
  if (booking.travellersComplete < booking.travellersTotal) {
    rows.push(
      <Row
        key="details"
        title={t("details", { done: booking.travellersComplete, total: booking.travellersTotal })}
        action={<Jump to="travellers" label={t("fillIn")} />}
      />,
    );
  }
  if (booking.startDate === null && booking.departure === null && mayEdit) {
    rows.push(<Row key="date" title={t("noDate")} action={<TravelDateDialog booking={booking} />} />);
  }
  if (rows.length === 0) return null;
  return (
    <SectionCard title={t("title")} className={cardTints.attention}>
      <ItemGroup>{rows}</ItemGroup>
    </SectionCard>
  );
}
