"use client";

// The refund after a cancellation, on the booking's money (release 6): its amount, due or paid, and for whoever records
// payments, Mark refunded.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { MarkRefundedDialog } from "./refund-dialog";

export function RefundSection({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.payments");
  const mayCheck = useHolds("quotes:record_payments");
  if (booking.refund === null) return null;
  return (
    <>
      <Separator />
      <h3 className="font-semibold">{t("refund")}</h3>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <span className="numbers">{rupees(booking.refund.amountPaise)}</span>{" "}
            <StatusBadge tone={booking.refund.status === "refunded" ? "good" : "attention"}>
              {t(booking.refund.status === "refunded" ? "refunded" : "refundDue")}
            </StatusBadge>
          </ItemTitle>
          {booking.refund.status === "refunded" && booking.refund.refundedOn !== null && (
            <ItemDescription>
              {formatCalendarDay(booking.refund.refundedOn)}
              {booking.refund.method === null ? "" : ` · ${t(`methods.${booking.refund.method as "upi"}`)}`}
              {booking.refund.reference === "" ? "" : ` · ${booking.refund.reference}`}
            </ItemDescription>
          )}
        </ItemContent>
        {booking.refund.status === "due" && mayCheck && (
          <ItemActions>
            <MarkRefundedDialog bookingId={booking.id} />
          </ItemActions>
        )}
      </Item>
    </>
  );
}
