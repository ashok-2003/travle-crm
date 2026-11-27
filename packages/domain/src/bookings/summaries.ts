// Bookings in brief, as the lists show them (release 6; the table, 2026-11-27): each with its customer and trip, its money
// and payment state at the agency's today, its travellers' progress, payments to check and a refund due. The payment state
// is worked out here once, from the quote's payments and payments due (dueStatesOf, paymentStateOf), for a list's page and
// for the table's payment filter alike. Money is the quote's, read through quote_id; a cancelled booking owes its charge.
import type { BookingPaymentState, BookingSummary } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../kernel/index.js";
import { dueStatesOf, paymentStateOf } from "../quotes/index.js";
import { dayOf } from "./rows.js";

/** The departure a booking is on, in brief, or null. */
export const departureRefOf = (departure: { id: string; title: string; startDate: Date } | null) =>
  departure === null ? null : { id: departure.id, title: departure.title, startDate: dayOf(departure.startDate) };

/** What a booking is worth to be paid: the trip's total, or, once cancelled, the charge kept. */
export const owedOf = (booking: { status: string; chargePaise: bigint | null; quote: { totalPaise: bigint } }) =>
  booking.status === "cancelled" ? Number(booking.chargePaise ?? 0n) : Number(booking.quote.totalPaise);

/** What a booking's money needs: its quote, status and charge, and the quote's total. */
export interface MoneyRow {
  id: string;
  quoteId: string;
  status: string;
  chargePaise: bigint | null;
  quote: { totalPaise: bigint };
}

export interface BookingMoney {
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  paymentState: BookingPaymentState;
}

/**
 * Each booking's money by its id: what it owes, what was paid (an unchecked claim is not), what is left, and its payment
 * state; a payment due is overdue when what was paid, earliest first, doesn't cover it and its day is before today. A
 * cancelled booking is never overdue.
 */
export async function bookingMoneyOf(
  tx: OrgTx,
  rows: readonly MoneyRow[],
  today: CalendarDate,
): Promise<Map<string, BookingMoney>> {
  const quoteIds = rows.map((row) => row.quoteId);
  const [paid, dues] = await Promise.all([
    tx.quotePayment.groupBy({
      by: ["quoteId"],
      where: { quoteId: { in: quoteIds }, voidedAt: null },
      _sum: { amountPaise: true },
    }),
    tx.quoteInstallment.findMany({
      where: { quoteId: { in: quoteIds } },
      select: { id: true, quoteId: true, amountPaise: true, dueOn: true },
    }),
  ]);
  const paidOf = new Map(paid.map((entry) => [entry.quoteId, Number(entry._sum.amountPaise ?? 0n)]));
  // Each quote's dues, gathered once: the payment filter reads every booking it matches.
  const duesOf = new Map<string, { id: string; amountPaise: number; dueOn: string }[]>();
  for (const due of dues) {
    const each = { id: due.id, amountPaise: Number(due.amountPaise), dueOn: dayOf(due.dueOn) };
    duesOf.set(due.quoteId, [...(duesOf.get(due.quoteId) ?? []), each]);
  }
  return new Map(
    rows.map((row) => {
      const paidPaise = paidOf.get(row.quoteId) ?? 0;
      const totalPaise = owedOf(row);
      const balancePaise = Math.max(0, totalPaise - paidPaise);
      const states = dueStatesOf(duesOf.get(row.quoteId) ?? [], paidPaise, today);
      const anyOverdue = row.status !== "cancelled" && [...states.values()].includes("overdue");
      return [
        row.id,
        { totalPaise, paidPaise, balancePaise, paymentState: paymentStateOf({ paidPaise, balancePaise, anyOverdue }) },
      ];
    }),
  );
}

/** The columns a booking's summary reads. */
export const summaryColumns = {
  id: true,
  leadId: true,
  quoteId: true,
  number: true,
  status: true,
  startDate: true,
  endDate: true,
  chargePaise: true,
  departure: { select: { id: true, title: true, startDate: true } },
  lead: { select: { person: { select: { name: true } } } },
  quote: { select: { title: true, totalPaise: true } },
} as const;

export interface SummaryRow extends MoneyRow {
  leadId: string;
  number: string;
  startDate: Date | null;
  endDate: Date | null;
  departure: { id: string; title: string; startDate: Date } | null;
  lead: { person: { name: string } };
  quote: { title: string; totalPaise: bigint };
}

/** The bookings in brief, in the order given. */
export async function summariesOf(
  tx: OrgTx,
  rows: readonly SummaryRow[],
  today: CalendarDate,
): Promise<BookingSummary[]> {
  const ids = rows.map((row) => row.id);
  const [money, travellers, completes, claims, refunds] = await Promise.all([
    bookingMoneyOf(tx, rows, today),
    tx.bookingTraveller.groupBy({ by: ["bookingId"], where: { bookingId: { in: ids } }, _count: { _all: true } }),
    tx.bookingTraveller.groupBy({
      by: ["bookingId"],
      where: { bookingId: { in: ids }, completeAt: { not: null } },
      _count: { _all: true },
    }),
    tx.paymentClaim.groupBy({
      by: ["bookingId"],
      where: { bookingId: { in: ids }, status: "pending" },
      _count: { _all: true },
    }),
    tx.bookingRefund.findMany({
      where: { bookingId: { in: ids }, status: "due" },
      select: { bookingId: true, amountPaise: true },
    }),
  ]);
  return rows.map((row) => {
    const owed = money.get(row.id);
    if (owed === undefined) throw new Error("Every booking's money was read");
    return {
      id: row.id,
      number: row.number,
      status: row.status as BookingSummary["status"],
      leadId: row.leadId,
      quoteId: row.quoteId,
      customerName: row.lead.person.name,
      title: row.quote.title,
      startDate: row.startDate === null ? null : dayOf(row.startDate),
      endDate: row.endDate === null ? null : dayOf(row.endDate),
      departure: departureRefOf(row.departure),
      ...owed,
      travellersTotal: travellers.find((entry) => entry.bookingId === row.id)?._count._all ?? 0,
      travellersComplete: completes.find((entry) => entry.bookingId === row.id)?._count._all ?? 0,
      pendingClaims: claims.find((entry) => entry.bookingId === row.id)?._count._all ?? 0,
      refundDuePaise: Number(refunds.find((entry) => entry.bookingId === row.id)?.amountPaise ?? 0n),
    };
  });
}
