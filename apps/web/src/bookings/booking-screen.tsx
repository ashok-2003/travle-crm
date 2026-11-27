"use client";

// /bookings/<id> (release 6): one booking. It leads with its trip (the name, the travel date, the people, whose it is), its
// actions in one row, and what needs the agency now (Needs you), then its money and travellers, and the trip, reminders and
// feedback beside them. A booking out of the member's scope is "not found", as a lead is.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { InfoIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { refusalOf } from "@/data/api-error";
import { rupees } from "@/components/forms/money-field";
import { formatCalendarDay, formatDay, formatWeekday } from "@/lib/format";
import { departureRoute, leadRoute, routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { BookingCostsCard } from "@/finance/booking-costs-card";
import { RecordPaymentDialog } from "@/quotes/money-dialogs";
import { BookingActions } from "./booking-actions";
import { BookingStatusBadge } from "./booking-status";
import { FeedbackCard } from "./feedback-card";
import { NeedsYou } from "./needs-you";
import { PaymentsCard } from "./payments-card";
import { ProofCard } from "./proof-card";
import { RemindersCard } from "./reminders-card";
import { TravellersCard } from "./travellers-card";
import { TripCard } from "./trip-card";
import { useBooking } from "./use-bookings";

/** A cancelled booking says so, with what it cost and what is owed back. */
function CancelledNotice({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.booking");
  const { timeZone } = useMe().organization;
  if (booking.status !== "cancelled" || booking.cancellation === null) return null;
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle>
        {t("cancelledTitle", { day: formatDay(new Date(booking.cancellation.cancelledAt), { timeZone }) })}
      </AlertTitle>
      <AlertDescription>
        {t("cancelledBody", {
          charge: rupees(booking.cancellation.chargePaise),
          reason: booking.cancellation.reason,
        })}
        {booking.refundDuePaise > 0 ? ` ${t("refundDue", { amount: rupees(booking.refundDuePaise) })}` : ""}
      </AlertDescription>
    </Alert>
  );
}

/** The trip's date with its weekday and its people, in ink: "Fri 4 Dec · 2 people". */
function TripLine({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.booking");
  const date =
    booking.startDate === null
      ? t("noDate")
      : `${formatWeekday(new Date(`${booking.startDate}T00:00:00Z`), { timeZone: "UTC" })} ${formatCalendarDay(booking.startDate)}`;
  return (
    <p className="text-section font-medium">
      {date} · {t("people", { count: booking.travellersTotal })}
    </p>
  );
}

/** Who it is for and which booking it is: the customer's lead, the number and, on a group trip, the departure. */
function WhoLine({ booking }: { booking: BookingDetail }) {
  const tDeparture = useTranslations("departures.booking");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <TextLink href={leadRoute(booking.leadId)} inline>
        {booking.customerName}
      </TextLink>
      <span className="numbers text-muted-foreground">{booking.number}</span>
      {booking.departure !== null && (
        <TextLink href={departureRoute(booking.departure.id)} inline>
          {tDeparture("onDeparture", {
            day: formatCalendarDay(booking.departure.startDate),
            title: booking.departure.title,
          })}
        </TextLink>
      )}
    </p>
  );
}

/**
 * Record payment, opened from Needs you (for the payment due named) or the money's own button (for what is owed next),
 * with that amount filled in: one dialog for the page, taking the focus back to whatever opened it.
 */
function useRecordPayment(booking: BookingDetail | undefined) {
  const [state, setState] = useState<{ suggested: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = (installmentId?: string) => {
    if (booking === undefined) return;
    const due =
      booking.installments.find((one) => one.id === installmentId) ?? booking.installments.find((one) => !one.paid);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setState({ suggested: Math.min(booking.balancePaise, due?.amountPaise ?? booking.balancePaise) });
  };
  const dialog =
    booking === undefined || state === null ? null : (
      <RecordPaymentDialog
        quoteId={booking.quoteId}
        suggested={state.suggested}
        held={{
          open: true,
          setOpen: (next) => {
            if (!next) setState(null);
          },
        }}
        returnFocusTo={opener}
      />
    );
  return { open, dialog };
}

export function BookingScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookings.booking");
  const tCommon = useTranslations("common");
  const booking = useBooking(bookingId);
  const recordPayment = useRecordPayment(booking.data);
  const body = (): ReactNode => {
    if (booking.data) {
      const data = booking.data;
      return (
        <>
          <BackLink href={routes.bookings} label={t("backToBookings")} />
          <PageHeader title={data.title} status={<BookingStatusBadge status={data.status} />} />
          <TripLine booking={data} />
          <WhoLine booking={data} />
          <BookingActions booking={data} />
          <CancelledNotice booking={data} />
          {recordPayment.dialog}
          <NeedsYou booking={data} onRecordPayment={recordPayment.open} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <div className="flex flex-col gap-6">
              <PaymentsCard booking={data} onRecordPayment={recordPayment.open} />
              <ProofCard booking={data} />
              <TravellersCard booking={data} />
              <BookingCostsCard quoteId={data.quoteId} />
              <FeedbackCard booking={data} />
            </div>
            <div className="flex flex-col gap-6">
              <TripCard booking={data} />
              <RemindersCard booking={data} />
            </div>
          </div>
        </>
      );
    }
    if (refusalOf(booking.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (booking.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={booking.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void booking.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };
  return (
    <div className="flex flex-col gap-6">
      {booking.data === undefined && <BackLink href={routes.bookings} label={t("backToBookings")} />}
      {body()}
    </div>
  );
}
