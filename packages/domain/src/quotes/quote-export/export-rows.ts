// One quote as a row of the quotes export (bookings revamp, 2026-11-27): the table's columns in its order, with the
// customer's phone after their name, in the words the screens use (a draft behind an unpaid AI booking says what it waits
// for), money in rupees as numbers, the last change on the agency's clock, and its link.
import type { QuotePaymentWait, QuoteStatus } from "@travel-crm/contracts/quotes";
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import { rupeesOf, wallClockOf } from "../../exports/index.js";
import type { QuoteTableItem } from "../table-page.js";

export const quoteExportColumns: readonly WriterColumn[] = [
  { header: "Customer", kind: "text" },
  { header: "Phone", kind: "phone" },
  { header: "Trip", kind: "text" },
  { header: "Travel date", kind: "date" },
  { header: "Status", kind: "text" },
  { header: "Total", kind: "number" },
  { header: "Paid", kind: "number" },
  { header: "To pay", kind: "number" },
  { header: "Last change", kind: "date-time" },
  { header: "Salesperson", kind: "text" },
  { header: "Quote link", kind: "text" },
];

const statusWords: Record<QuoteStatus | QuotePaymentWait, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  replaced: "Replaced",
  waiting: "Waiting for payment",
  hold_expired: "Hold expired",
};

/** What a row is written with that the quote doesn't hold: its phone, salesperson, what it waits for, the clock. */
export interface QuoteRowContext {
  appUrl: string;
  timeZone: string;
  phone: string | null;
  /** Null for nobody; "Former member" for someone no longer active. */
  salesperson: string | null;
  paymentWait: QuotePaymentWait | undefined;
}

export function quoteExportRowOf(quote: QuoteTableItem, context: QuoteRowContext): WrittenCell[] {
  // As the list's badge says it: only a draft waits for a payment.
  const status = quote.status === "draft" && context.paymentWait !== undefined ? context.paymentWait : quote.status;
  return [
    quote.customerName,
    context.phone === null ? null : internationalPhone(context.phone),
    quote.title,
    quote.startDate,
    statusWords[status],
    rupeesOf(quote.totals.totalPaise),
    rupeesOf(quote.totals.paidPaise),
    rupeesOf(quote.totals.balancePaise),
    wallClockOf(new Date(quote.updatedAt), context.timeZone),
    context.salesperson,
    `${context.appUrl}/quotes/${quote.id}`,
  ];
}
