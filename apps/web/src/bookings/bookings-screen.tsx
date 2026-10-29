"use client";

// /bookings (release 6): the member's bookings (or the agency's), newest first, each with its customer and trip, status, what is
// paid and still to pay, "3 of 4 details" and a flag for a payment waiting to be checked; chips narrow it to one status or to the
// bookings with a payment to check. A booking waiting for confirmation is the one to open first.
import type { BookingSummary } from "@travel-crm/contracts/bookings";
import { BriefcaseBusinessIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { rupees } from "@/components/forms/money-field";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { BookingStatusBadge } from "./booking-status";
import { useBookingList } from "./use-bookings";

const filters = ["all", "requested", "confirmed", "completed", "cancelled", "claims"] as const;
type Filter = (typeof filters)[number];

const inputOf = (filter: Filter) =>
  filter === "all" ? {} : filter === "claims" ? { claimsPending: true } : { status: filter };

function BookingRow({ booking }: { booking: BookingSummary }) {
  const t = useTranslations("bookings.list");
  return (
    <TableRow>
      <TableCell>
        <TextLink inline href={bookingRoute(booking.id)}>
          {booking.customerName}
        </TextLink>
        <p className="text-caption text-muted-foreground">
          <span className="numbers">{booking.number}</span> · {booking.title}
          {booking.startDate === null ? "" : ` · ${formatCalendarDay(booking.startDate)}`}
        </p>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <BookingStatusBadge status={booking.status} />
          {booking.pendingClaims > 0 && (
            <StatusBadge tone="attention">{t("claims", { count: booking.pendingClaims })}</StatusBadge>
          )}
        </div>
      </TableCell>
      <TableCell className="numbers text-right">
        {rupees(booking.paidPaise)}
        <p className="text-caption text-muted-foreground">{t("toPay", { amount: rupees(booking.balancePaise) })}</p>
      </TableCell>
      <TableCell className="text-right">
        {booking.status === "cancelled" ? (
          booking.refundDuePaise > 0 ? (
            t("refundDue", { amount: rupees(booking.refundDuePaise) })
          ) : (
            ""
          )
        ) : (
          <span className="numbers">
            {t("details", { done: booking.travellersComplete, total: booking.travellersTotal })}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function BookingsScreen() {
  const t = useTranslations("bookings.list");
  const tCommon = useTranslations("common");
  const [filter, setFilter] = useState<Filter>("all");
  const list = useBookingList(inputOf(filter));
  const body = () => {
    if (list.items === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={4} label={t("loading")} />
      );
    }
    if (list.items.length === 0) {
      return <EmptyState icon={BriefcaseBusinessIcon} message={t(filter === "all" ? "empty" : "noneHere")} />;
    }
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.booking")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.paid")}</TableHead>
              <TableHead className="text-right">{t("columns.travellers")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </TableBody>
        </Table>
        <ShowMoreButton pages={list} label={t("more")} />
      </>
    );
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(value) => {
          if (value !== "") setFilter(value as Filter);
        }}
        aria-label={t("filterLabel")}
        className="flex-wrap"
      >
        {filters.map((one) => (
          <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
            {t(`filters.${one}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {body()}
    </div>
  );
}
