"use client";

// /bookings/<id> (release 6): one booking. Its status and actions first, then what needs attention (a booking waiting for the
// agency, a payment to check, a refund due), its money and travellers, and the trip, reminders and feedback beside them. A
// booking out of the member's scope is "not found", as a lead is.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { InfoIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { refusalOf } from "@/data/api-error";
import { rupees } from "@/components/forms/money-field";
import { formatCalendarDay, formatDay } from "@/lib/format";
import { departureRoute, leadRoute, routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { BookingActions } from "./booking-actions";
import { BookingStatusBadge } from "./booking-status";
import { FeedbackCard } from "./feedback-card";
import { PaymentsCard } from "./payments-card";
import { ProofCard } from "./proof-card";
import { RemindersCard } from "./reminders-card";
import { TravellersCard } from "./travellers-card";
import { TripCard } from "./trip-card";
import { useBooking } from "./use-bookings";

/** What the booking asks of the agency now, in one sentence. */
function Attention({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.booking");
  const { timeZone } = useMe().organization;
  if (booking.status === "requested") {
    return (
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertTitle>{t("requestedTitle")}</AlertTitle>
        <AlertDescription>{t("requestedBody", { name: booking.customerName })}</AlertDescription>
      </Alert>
    );
  }
  if (booking.status === "cancelled" && booking.cancellation !== null) {
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
  if (booking.pendingClaims > 0) {
    return (
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>{t("claimsWaiting", { count: booking.pendingClaims })}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function BookingScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookings.booking");
  const tDeparture = useTranslations("departures.booking");
  const tCommon = useTranslations("common");
  const booking = useBooking(bookingId);
  const body = (): ReactNode => {
    if (booking.data) {
      const data = booking.data;
      return (
        <>
          <BackLink href={routes.bookings} label={t("backToBookings")} />
          <PageHeader
            title={data.customerName}
            intro={
              <>
                <span className="numbers">{data.number}</span> · {data.title}
                {data.startDate === null ? "" : ` · ${formatCalendarDay(data.startDate)}`}{" "}
                <BookingStatusBadge status={data.status} />
              </>
            }
          />
          <TextLink href={leadRoute(data.leadId)} inline>
            {t("openLead", { name: data.customerName })}
          </TextLink>
          {data.departure !== null && (
            <TextLink href={departureRoute(data.departure.id)} inline>
              {tDeparture("onDeparture", {
                day: formatCalendarDay(data.departure.startDate),
                title: data.departure.title,
              })}
            </TextLink>
          )}
          <BookingActions booking={data} />
          <Attention booking={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <div className="flex flex-col gap-6">
              <PaymentsCard booking={data} />
              <ProofCard booking={data} />
              <TravellersCard booking={data} />
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
    <div className="flex max-w-[1200px] flex-col gap-6">
      {booking.data === undefined && <BackLink href={routes.bookings} label={t("backToBookings")} />}
      {body()}
    </div>
  );
}
