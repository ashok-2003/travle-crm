"use client";

// What the Bookings list shows of each booking (bookings revamp, 2026-11-27). On a computer the table's columns: the
// booking (the customer, a link, over its number), the trip (its title over its departure), the travel date, the people,
// the status (and payments to check), the total, what is paid over what is still to pay (in red, and said, when a payment
// is overdue; a refund due once cancelled), the travellers' details ("1 of 2") and the salesperson, for a member who sees
// everyone's. On a phone each booking stacks the same: the customer and status, the trip and its date, the money, then the
// number, the details and the salesperson.
import type { BookingTableRow, BookingTableSort } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { DataColumn } from "@/components/data-table/data-table";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { ItemContent, ItemDescription, ItemHeader, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { BookingStatusBadge } from "./booking-status";

const caption = "text-caption text-muted-foreground";
/** An amount in the numbers font, the words around it in the text's own. */
const numbers = (chunks: ReactNode) => <span className="numbers">{chunks}</span>;

/** The status, and a badge for payments to check. */
function StatusCell({ booking }: { booking: BookingTableRow }) {
  const t = useTranslations("bookings.list");
  return (
    <div className="flex flex-wrap items-center gap-1">
      <BookingStatusBadge status={booking.status} />
      {booking.pendingClaims > 0 && (
        <StatusBadge tone="attention">{t("claims", { count: booking.pendingClaims })}</StatusBadge>
      )}
    </div>
  );
}

/** What is paid, over what is still to pay (red, with Overdue, when a payment is late), or a refund due. */
function MoneyCell({ booking, end = false }: { booking: BookingTableRow; end?: boolean }) {
  const t = useTranslations("bookings.list");
  const overdue = booking.paymentState === "overdue";
  return (
    <div className={cn("flex flex-col gap-0.5", end ? "items-end" : "items-start")}>
      <span>{t.rich("paidAmount", { amount: rupees(booking.paidPaise), n: numbers })}</span>
      {booking.refundDuePaise > 0 ? (
        <span className={caption}>{t.rich("refundDue", { amount: rupees(booking.refundDuePaise), n: numbers })}</span>
      ) : (
        booking.balancePaise > 0 && (
          <span className={cn("text-caption", overdue ? "text-status-bad-ink" : "text-muted-foreground")}>
            {t.rich("toPay", { amount: rupees(booking.balancePaise), n: numbers })}
          </span>
        )
      )}
      {overdue && <StatusBadge tone="bad">{t("overdue")}</StatusBadge>}
    </div>
  );
}

function useWords() {
  const t = useTranslations("bookings.list");
  return {
    t,
    travelDate: (booking: BookingTableRow) =>
      booking.startDate === null ? t("noDate") : formatCalendarDay(booking.startDate),
    people: (booking: BookingTableRow) => t("people", { adults: booking.adults, children: booking.children }),
    details: (booking: BookingTableRow, key: "details" | "detailsLine" = "details") =>
      t.rich(key, { done: booking.travellersComplete, total: booking.travellersTotal, n: numbers }),
    salesperson: (booking: BookingTableRow) => booking.ownerName ?? t("noSalesperson"),
  };
}

/** The table's columns; the salesperson only for a member who sees everyone's bookings. */
export function useBookingColumns(showSalesperson: boolean): DataColumn<BookingTableRow, BookingTableSort>[] {
  const { t, travelDate, people, details, salesperson } = useWords();
  const header = (
    column: "booking" | "trip" | "travel" | "people" | "status" | "total" | "paid" | "details" | "salesperson",
  ) => t(`columns.${column}`);
  const columns: DataColumn<BookingTableRow, BookingTableSort>[] = [
    {
      key: "booking",
      header: header("booking"),
      sort: "customer",
      cell: (booking) => (
        <div className="flex flex-col gap-0.5">
          <span className="lg:[&>a]:min-h-0">
            <TextLink href={bookingRoute(booking.id)}>
              <span className="script-leading">{booking.customerName}</span>
            </TextLink>
          </span>
          <span className={cn("numbers", caption)}>{booking.number}</span>
        </div>
      ),
    },
    {
      key: "trip",
      header: header("trip"),
      cell: (booking) => (
        <div className="flex flex-col gap-0.5">
          <span className="script-leading">{booking.title}</span>
          {booking.departure !== null && (
            <span className={caption}>{t("onDeparture", { title: booking.departure.title })}</span>
          )}
        </div>
      ),
    },
    {
      key: "travel",
      header: header("travel"),
      sort: "travel",
      width: 128,
      cell: (booking) => (
        <span className={booking.startDate === null ? caption : "numbers"}>{travelDate(booking)}</span>
      ),
    },
    { key: "people", header: header("people"), width: 112, cell: people },
    { key: "status", header: header("status"), width: 176, cell: (booking) => <StatusCell booking={booking} /> },
    {
      key: "total",
      header: header("total"),
      sort: "total",
      width: 128,
      end: true,
      cell: (booking) => <span className="numbers">{rupees(booking.totalPaise)}</span>,
    },
    {
      key: "paid",
      header: header("paid"),
      width: 160,
      end: true,
      cell: (booking) => <MoneyCell booking={booking} end />,
    },
    {
      key: "details",
      header: header("details"),
      width: 96,
      end: true,
      cell: (booking) => (booking.status === "cancelled" ? null : details(booking)),
    },
  ];
  return showSalesperson
    ? [...columns, { key: "salesperson", header: header("salesperson"), width: 144, cell: salesperson }]
    : columns;
}

/** A booking on a phone: the customer and status, the trip and its date, the money, then the rest in a line. */
export function useStackedBooking(showSalesperson: boolean): (booking: BookingTableRow) => ReactNode {
  const { t, travelDate, people, details, salesperson } = useWords();
  return (booking) => {
    const rest: ReactNode[] = [
      numbers(booking.number),
      people(booking),
      ...(booking.status === "cancelled" ? [] : [details(booking, "detailsLine")]),
      ...(showSalesperson ? [salesperson(booking)] : []),
    ];
    return (
      <>
        <ItemHeader className="items-start">
          <ItemTitle className="min-w-0">
            <span className="script-leading wrap-anywhere">{booking.customerName}</span>
          </ItemTitle>
          <StatusCell booking={booking} />
        </ItemHeader>
        <ItemContent className="gap-1">
          <ItemDescription className="script-leading">
            {t("tripOn", { trip: booking.title, day: travelDate(booking) })}
          </ItemDescription>
          <MoneyCell booking={booking} />
          <span className={caption}>
            {rest.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </span>
        </ItemContent>
      </>
    );
  };
}
