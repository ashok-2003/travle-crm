// How a booking is read for the rest of the module: its row with its lead's owner and customer and its quote's money, who
// may see it (bookings:view's scope is the lead's owner, as quotes' is), and the row locked for a change. Money is the
// quote's: a booking reads its payments and payments due through quote_id.
import type { OrgTx } from "@travel-crm/db";
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export const bookingColumns = {
  id: true,
  organizationId: true,
  quoteId: true,
  leadId: true,
  number: true,
  status: true,
  startDate: true,
  endDate: true,
  departureId: true,
  departure: { select: { id: true, title: true, startDate: true } },
  level: true,
  reportingTime: true,
  reportingPlace: true,
  driverName: true,
  driverPhone: true,
  emergencyName: true,
  emergencyPhone: true,
  policySnapshot: true,
  sendsReminders: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelReason: true,
  chargePaise: true,
  confirmTaskId: true,
  remindersPausedAt: true,
  feedbackRequestedAt: true,
  tripPdfDocumentId: true,
  tripPdfFingerprint: true,
  proofMessageIds: true,
  quotePlaceholder: true,
  createdAt: true,
  lead: { select: { ownerUserId: true, personId: true, person: { select: { name: true, phoneE164: true } } } },
  quote: {
    select: {
      id: true,
      title: true,
      status: true,
      adults: true,
      children: true,
      totalPaise: true,
      subtotalPaise: true,
      taxPaise: true,
      version: true,
      startDate: true,
      days: true,
    },
  },
} as const;

export type BookingRow = NonNullable<Awaited<ReturnType<typeof readBooking>>>;

const readBooking = (tx: OrgTx, bookingId: string) =>
  tx.booking.findUnique({ where: { id: bookingId }, select: bookingColumns });

/** A day stored as a Date (Postgres date) as YYYY-MM-DD. */
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
export const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** The live booking, if the member may see its lead's bookings; NOT_FOUND otherwise, whatever the reason. */
export async function findBookingInScope(tx: OrgTx, access: MemberAccess, bookingId: string): Promise<BookingRow> {
  const row = await readBooking(tx, bookingId);
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such booking");
  assertRecordInScope(access, "bookings:view", row.lead.ownerUserId);
  return row;
}

/**
 * The same, with the booking's row locked until the transaction ends: two people confirming, cancelling or deciding a
 * claim at once take turns, and the second finds what the first did.
 */
export async function findBookingForChange(tx: OrgTx, access: MemberAccess, bookingId: string): Promise<BookingRow> {
  await tx.$queryRaw`SELECT id FROM booking WHERE id = ${bookingId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  return findBookingInScope(tx, access, bookingId);
}

/** A booking for the system (the traveller's link, the worker): no member's scope; the row locked when `lock` is set. */
export async function findBookingForSystem(tx: OrgTx, bookingId: string, lock = false): Promise<BookingRow> {
  if (lock) await tx.$queryRaw`SELECT id FROM booking WHERE id = ${bookingId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  const row = await readBooking(tx, bookingId);
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such booking");
  return row;
}

/** The quote's live payments, summed: what the customer has paid. */
export async function paidOnQuote(tx: OrgTx, quoteId: string): Promise<number> {
  const total = await tx.quotePayment.aggregate({
    where: { quoteId, voidedAt: null },
    _sum: { amountPaise: true },
  });
  return Number(total._sum.amountPaise ?? 0n);
}

/** A booking that can still change: not cancelled and not over. */
export function assertOpen(booking: Pick<BookingRow, "status">): void {
  if (booking.status === "cancelled") {
    throw new DomainError("CONFLICT", "BOOKING_CANCELLED", "This booking was cancelled");
  }
}

/** A confirmed booking: the agency has said yes, so money, stays and vouchers apply. */
export function assertConfirmed(booking: Pick<BookingRow, "status">): void {
  if (booking.status === "requested") {
    throw new DomainError("CONFLICT", "BOOKING_NOT_CONFIRMED", "Confirm the booking first");
  }
  assertOpen(booking);
}
