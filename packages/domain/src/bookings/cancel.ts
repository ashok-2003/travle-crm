// Cancelling a booking and the refund (spec 2.9). Code works out the days before departure, picks the agency's step and
// shows what was paid, the cancellation charge (a share of the trip's total including GST) and the refund due; staff may
// change the charge, saying why, and the change is audited with before, after and reason. The booking becomes Cancelled, its
// unsent reminders and its "Confirm booking" task end, and a refund due becomes a row and a "Refund" task for the lead's
// owner. The refund is paid outside the product and marked refunded; it is its own row, never a negative payment, so every
// sum of payments stays right. Travellers do not cancel from the page; they ask their agent.
import type { CancelBookingInput, CancelPreview, MarkRefundedInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { announceSeatsFreed } from "../departures/index.js";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { calendarDateIn, DomainError, formatMoney, money } from "../kernel/index.js";
import { createTask, finishTasks } from "../tasks/index.js";
import { cancellationCosts, snapshotOf } from "./policy.js";
import { skipUnsentReminders } from "./reminders.js";
import { asDate, findBookingForChange, findBookingInScope, paidOnQuote, type BookingRow } from "./rows.js";
import { currentPolicy } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

async function costsOf(tx: OrgTx, booking: BookingRow, now: Date, chargeOverridePaise?: number) {
  const policy = snapshotOf(booking.policySnapshot) ?? (await currentPolicy(tx));
  const timeZone = await organizationTimeZone(tx, booking.organizationId);
  const totalPaise = Number(booking.quote.totalPaise);
  const paidPaise = await paidOnQuote(tx, booking.quoteId);
  const costs = cancellationCosts({
    policy,
    departure: booking.startDate,
    cancelledOn: asDate(calendarDateIn(now, timeZone)),
    totalPaise,
    paidPaise,
    chargeOverridePaise,
  });
  return { ...costs, totalPaise, paidPaise };
}

/** What cancelling today would cost, before anyone commits to it. */
export async function previewCancellation(
  tx: OrgTx,
  access: MemberAccess,
  bookingId: string,
  now: Date,
): Promise<CancelPreview> {
  const booking = await findBookingInScope(tx, access, bookingId);
  return costsOf(tx, booking, now);
}

export async function cancelBooking(
  tx: OrgTx,
  access: MemberAccess,
  input: CancelBookingInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  if (booking.status !== "requested" && booking.status !== "confirmed") {
    throw new DomainError("CONFLICT", "BOOKING_NOT_CANCELLABLE", "Only a requested or confirmed booking is cancelled");
  }
  const worked = await costsOf(tx, booking, now);
  const final = input.chargePaise === undefined ? worked : await costsOf(tx, booking, now, input.chargePaise);
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: access.userId,
      cancelReason: input.reason,
      chargePaise: BigInt(final.chargePaise),
    },
  });
  await skipUnsentReminders(tx, access, booking.id, "cancelled", now);
  await finishTasks(tx, access, [booking.confirmTaskId], "cancelled", now);
  if (final.refundPaise > 0) {
    const task = await createTask(tx, access, {
      kind: "task",
      title: `Refund ${formatMoney(money(final.refundPaise))} to ${booking.lead.person.name}`.slice(0, 200),
      dueAt: now,
      assigneeUserId: booking.lead.ownerUserId,
      record: { recordType: "booking", recordId: booking.id },
    });
    await tx.bookingRefund.create({
      data: { bookingId: booking.id, amountPaise: BigInt(final.refundPaise), taskId: task.id },
    });
  }
  await recordAudit(tx, access, {
    action: "booking.cancelled",
    entityType: "booking",
    entityId: booking.id,
    before: { status: booking.status },
    after: { status: "cancelled", chargePaise: final.chargePaise, refundPaise: final.refundPaise },
  });
  if (input.chargePaise !== undefined) {
    await recordAudit(tx, access, {
      action: "booking.charge-changed",
      entityType: "booking",
      entityId: booking.id,
      before: { chargePaise: worked.chargePaise },
      after: { chargePaise: final.chargePaise, reason: input.chargeOverrideReason ?? "" },
    });
  }
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "cancelled" });
  await publishEvent(tx, { type: "booking.cancelled", payload: { bookingId: booking.id } });
  // The seats are free again: a lead waiting for them is told.
  if (booking.departureId !== null) await announceSeatsFreed(tx, booking.departureId);
}

/** The refund was paid outside the product: marked with the day, how and the reference. */
export async function markRefunded(
  tx: OrgTx,
  access: MemberAccess,
  input: MarkRefundedInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  const refund = await tx.bookingRefund.findFirst({
    where: { bookingId: booking.id },
    select: { id: true, status: true, taskId: true, amountPaise: true },
  });
  if (refund === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No refund is due");
  if (refund.status === "refunded") return;
  await tx.bookingRefund.update({
    where: { id: refund.id },
    data: {
      status: "refunded",
      refundedOn: asDate(input.refundedOn),
      method: input.method,
      reference: input.reference,
      recordedBy: access.userId,
    },
  });
  await finishTasks(tx, access, [refund.taskId], "done", now);
  await recordAudit(tx, access, {
    action: "booking.refunded",
    entityType: "booking",
    entityId: booking.id,
    after: { amountPaise: Number(refund.amountPaise), method: input.method, refundedOn: input.refundedOn },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "refunded" });
}
