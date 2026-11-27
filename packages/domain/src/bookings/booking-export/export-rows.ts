// One booking as a row of the bookings export (bookings revamp, 2026-11-27): the table's columns in its order, with the
// customer's phone after their name, in the words the screens use, money in rupees as numbers, and its link.
import type { BookingPaymentState, BookingStatus } from "@travel-crm/contracts/bookings";
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import { rupeesOf } from "../../exports/index.js";
import type { BookingTableItem } from "../table-page.js";

export const bookingExportColumns: readonly WriterColumn[] = [
  { header: "Booking", kind: "text" },
  { header: "Customer", kind: "text" },
  { header: "Phone", kind: "phone" },
  { header: "Trip", kind: "text" },
  { header: "Departure", kind: "text" },
  { header: "Travel date", kind: "date" },
  { header: "Adults", kind: "number" },
  { header: "Children", kind: "number" },
  { header: "Status", kind: "text" },
  { header: "Total", kind: "number" },
  { header: "Paid", kind: "number" },
  { header: "To pay", kind: "number" },
  { header: "Payment", kind: "text" },
  { header: "Payments to check", kind: "number" },
  { header: "Refund due", kind: "number" },
  { header: "Travellers", kind: "number" },
  { header: "Details filled", kind: "number" },
  { header: "Salesperson", kind: "text" },
  { header: "Booking link", kind: "text" },
];

const statusWords: Record<BookingStatus, string> = {
  requested: "Waiting for you",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const paymentWords: Record<BookingPaymentState, string> = {
  paid: "Paid in full",
  part_paid: "Part paid",
  nothing: "Nothing received",
  overdue: "Overdue",
};

/** What a row is written with that the booking doesn't hold: its customer's phone and its salesperson's name. */
export interface BookingRowContext {
  appUrl: string;
  phone: string | null;
  /** Null for nobody; "Former member" for someone no longer active. */
  salesperson: string | null;
}

export function bookingExportRowOf(booking: BookingTableItem, context: BookingRowContext): WrittenCell[] {
  return [
    booking.number,
    booking.customerName,
    context.phone === null ? null : internationalPhone(context.phone),
    booking.title,
    booking.departure?.title ?? null,
    booking.startDate,
    booking.adults,
    booking.children,
    statusWords[booking.status],
    rupeesOf(booking.totalPaise),
    rupeesOf(booking.paidPaise),
    rupeesOf(booking.balancePaise),
    paymentWords[booking.paymentState],
    booking.pendingClaims,
    rupeesOf(booking.refundDuePaise),
    booking.travellersTotal,
    booking.travellersComplete,
    context.salesperson,
    `${context.appUrl}/bookings/${booking.id}`,
  ];
}
