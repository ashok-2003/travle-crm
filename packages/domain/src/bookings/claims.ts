// "I've paid" and the check (spec 2.2). The traveller says they paid: the amount, their UPI reference and, optionally, a
// screenshot. That makes a pending claim, a "Check payment" task for the lead's owner and a notice; the traveller sees
// "Payment being verified". Staff with quotes:record_payments check it against their bank and Confirm (the existing
// recordPayment, with the claim's id as its request id so a double tap records once) or Reject with a reason. Money
// never passes through us, and nothing matches the bank by itself. A claim waiting over a day brings its task back to
// due now and tells the managers.
import type { ConfirmClaimInput, PublicClaimInput, RejectClaimInput } from "@travel-crm/contracts/bookings";
import { publicClaimInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { calendarDateIn, DomainError, formatMoney, money, publicActor, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { recordPayment } from "../quotes/index.js";
import { bringTaskForward, createTask, finishTasks } from "../tasks/index.js";
import { rebuildReminders } from "./reminders.js";
import { findBookingForChange, findBookingForSystem, paidOnQuote, type BookingRow } from "./rows.js";
import { recordBookingEvent } from "./timeline.js";

export const CLAIM_KIND = "booking.payment-claimed";
export const CLAIM_WAITING_KIND = "booking.payment-waiting";
/** The most claims waiting at once on one booking: a traveller who keeps pressing the button is not heard ten times. */
const MOST_PENDING = 5;
const DAY = 24 * 3_600_000;

/** The booking behind a quote's link, if the traveller may still claim a payment on it. */
async function openBookingOfQuote(tx: OrgTx, quoteId: string): Promise<BookingRow> {
  const found = await tx.booking.findFirst({
    where: { quoteId, status: { in: ["requested", "confirmed"] } },
    select: { id: true },
  });
  if (found === null)
    throw new DomainError("CONFLICT", "BOOKING_NOT_OPEN", "Payments can't be claimed on this booking");
  return findBookingForSystem(tx, found.id, true);
}

/** The traveller's "I've paid". Returns the claim's id. */
export async function submitPaymentClaim(
  tx: OrgTx,
  input: { organizationId: string; quoteId: string; claim: PublicClaimInput },
  now: Date,
): Promise<string> {
  const claim = publicClaimInput.parse(input.claim);
  const booking = await openBookingOfQuote(tx, input.quoteId);
  if (claim.installmentId !== null) {
    const due = await tx.quoteInstallment.findFirst({
      where: { id: claim.installmentId, quoteId: booking.quoteId },
      select: { id: true },
    });
    if (due === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment due");
  }
  const left = Number(booking.quote.totalPaise) - (await paidOnQuote(tx, booking.quoteId));
  if (claim.amountPaise > left) {
    throw new DomainError("CONFLICT", "CLAIM_EXCEEDS_BALANCE", "That is more than is left to pay on this booking");
  }
  if (claim.reference === "" && claim.screenshotAttachmentId === null) {
    throw new DomainError("VALIDATION", "CLAIM_NEEDS_PROOF", "Add your UPI reference or a screenshot");
  }
  if ((await tx.paymentClaim.count({ where: { bookingId: booking.id, status: "pending" } })) >= MOST_PENDING) {
    throw new DomainError("LIMIT_REACHED", "TOO_MANY_CLAIMS", "Your earlier payments are still being checked");
  }
  if (claim.screenshotAttachmentId !== null) {
    const file = await tx.attachment.findFirst({
      where: {
        id: claim.screenshotAttachmentId,
        recordType: "payment_claim",
        recordId: booking.id,
        status: "ready",
        contentType: { startsWith: "image/" },
      },
      select: { id: true },
    });
    if (file === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  }
  const actor = publicActor(input.organizationId);
  const row = await tx.paymentClaim.create({
    data: {
      bookingId: booking.id,
      installmentId: claim.installmentId,
      amountPaise: BigInt(claim.amountPaise),
      reference: claim.reference,
      screenshotFileId: claim.screenshotAttachmentId,
    },
    select: { id: true },
  });
  const amount = formatMoney(money(claim.amountPaise));
  const task = await createTask(tx, actor, {
    kind: "task",
    title: `Check payment of ${amount} from ${booking.lead.person.name}`.slice(0, 200),
    dueAt: now,
    assigneeUserId: booking.lead.ownerUserId,
    record: { recordType: "booking", recordId: booking.id },
  });
  await tx.paymentClaim.update({ where: { id: row.id }, data: { taskId: task.id } });
  if (booking.lead.ownerUserId !== null) {
    await notify(tx, actor, {
      recipientUserIds: [booking.lead.ownerUserId],
      sourceEventId: noticeKey(row.id, CLAIM_KIND),
      kind: CLAIM_KIND,
      title: `${booking.lead.person.name} says they paid ${amount}`,
      body: `Check it against your bank for booking ${booking.number}.`,
      link: `/bookings/${booking.id}`,
      channels: ["push"],
    });
  }
  await recordAudit(tx, actor, {
    action: "booking.payment-claimed",
    entityType: "booking",
    entityId: booking.id,
    after: { claimId: row.id, amountPaise: claim.amountPaise },
  });
  await recordBookingEvent(tx, actor, { leadId: booking.leadId, bookingId: booking.id, event: "payment-claimed" });
  await publishEvent(tx, { type: "payment-claim.submitted", payload: { claimId: row.id, bookingId: booking.id } });
  return row.id;
}

async function pendingClaim(tx: OrgTx, access: MemberAccess, claimId: string) {
  const found = await tx.paymentClaim.findUnique({ where: { id: claimId }, select: { bookingId: true } });
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment claim");
  const booking = await findBookingForChange(tx, access, found.bookingId);
  const claim = await tx.paymentClaim.findUniqueOrThrow({
    where: { id: claimId },
    select: { id: true, status: true, amountPaise: true, reference: true, taskId: true },
  });
  return { booking, claim };
}

/** Staff confirm the money arrived: the payment is recorded on the quote (once, whatever the taps), the claim closed, the task done. */
export async function confirmClaim(
  tx: OrgTx,
  access: MemberAccess,
  input: ConfirmClaimInput,
  now: Date,
): Promise<void> {
  const { booking, claim } = await pendingClaim(tx, access, input.claimId);
  if (claim.status === "confirmed") return;
  if (claim.status !== "pending")
    throw new DomainError("CONFLICT", "CLAIM_DECIDED", "This payment was already decided");
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const { paymentId } = await recordPayment(
    tx,
    access,
    {
      quoteId: booking.quoteId,
      amountPaise: input.amountPaise ?? Number(claim.amountPaise),
      receivedOn: calendarDateIn(now, timeZone),
      method: "upi",
      reference: claim.reference,
      requestId: claim.id,
    },
    now,
  );
  await tx.paymentClaim.update({
    where: { id: claim.id },
    data: { status: "confirmed", paymentId, decidedBy: access.userId, decidedAt: now },
  });
  await finishTasks(tx, access, [claim.taskId], "done", now);
  if (booking.status === "confirmed") await rebuildReminders(tx, booking.id, now);
  await recordAudit(tx, access, {
    action: "booking.payment-confirmed",
    entityType: "booking",
    entityId: booking.id,
    after: { claimId: claim.id, paymentId, amountPaise: input.amountPaise ?? Number(claim.amountPaise) },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "payment-confirmed" });
}

/** Staff couldn't match the money: the claim is rejected with a reason, and the traveller may claim again. */
export async function rejectClaim(tx: OrgTx, access: MemberAccess, input: RejectClaimInput, now: Date): Promise<void> {
  const { booking, claim } = await pendingClaim(tx, access, input.claimId);
  if (claim.status !== "pending")
    throw new DomainError("CONFLICT", "CLAIM_DECIDED", "This payment was already decided");
  await tx.paymentClaim.update({
    where: { id: claim.id },
    data: { status: "rejected", rejectReason: input.reason, decidedBy: access.userId, decidedAt: now },
  });
  await finishTasks(tx, access, [claim.taskId], "done", now);
  await recordAudit(tx, access, {
    action: "booking.payment-rejected",
    entityType: "booking",
    entityId: booking.id,
    after: { claimId: claim.id, reason: input.reason },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "payment-rejected" });
}

/** A claim waiting over a day: its task is due now again and the managers are told, once. Returns how many were raised. */
export async function raiseStaleClaims(
  tx: OrgTx,
  organizationId: string,
  managers: readonly string[],
  now: Date,
): Promise<number> {
  const stale = await tx.paymentClaim.findMany({
    where: { status: "pending", createdAt: { lt: new Date(now.getTime() - DAY) } },
    take: 50,
    select: { id: true, bookingId: true, taskId: true, amountPaise: true },
  });
  const actor = systemActor(organizationId);
  let raised = 0;
  for (const claim of stale) {
    if (claim.taskId !== null && (await bringTaskForward(tx, actor, claim.taskId, now))) raised += 1;
    if (managers.length > 0) {
      await notify(tx, actor, {
        recipientUserIds: [...managers],
        sourceEventId: noticeKey(claim.id, CLAIM_WAITING_KIND),
        kind: CLAIM_WAITING_KIND,
        title: `A payment of ${formatMoney(money(Number(claim.amountPaise)))} has waited over a day`,
        body: "Someone says they paid and nobody has checked it yet.",
        link: `/bookings/${claim.bookingId}`,
        channels: ["push"],
      });
    }
  }
  return raised;
}
